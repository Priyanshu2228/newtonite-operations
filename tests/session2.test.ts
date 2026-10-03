import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { WorkItemService } from "../src/services/work-item.service";
import { WorkItemQueryService, ActivityQueryService } from "../src/services/query.service";
import {
  withIdempotency,
  findCompletedRecord,
  IDEMPOTENCY_OPERATION,
  computeRequestHash
} from "../src/services/idempotency.service";
import { Status, Priority, ActivityAction } from "@prisma/client";
import { PERSONAS } from "../src/lib/personas";
import {
  IdempotencyKeyRequiredError,
  IdempotencyKeyReuseError,
  StaleVersionError
} from "../src/lib/errors";

// Determine UUID for a team directly from the DB later or just query it in beforeEach. 
// For now, I can just fetch a team UUID in beforeEach rather than hardcoding.
let FIN_TEAM_ID: string;

const ADMIN_CTX = { id: PERSONAS.ADMIN.id, globalRole: "ADMIN", memberships: [] } as any;
const LEAD_CTX = { id: PERSONAS.FINANCE_LEAD.id, globalRole: "USER", memberships: [] } as any; // memberships will be populated in beforeEach

describe("Session 2 - Idempotency, Activity, and APIs", () => {
  let testItem: any;

  beforeEach(async () => {
    await prisma.activity.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.workItem.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.team.deleteMany();

    const finTeam = await prisma.team.create({
      data: { name: "Finance", description: "Finance Team" }
    });
    FIN_TEAM_ID = finTeam.id;

    LEAD_CTX.memberships = [{ teamId: FIN_TEAM_ID, teamRole: "LEAD" }];

    testItem = await WorkItemService.createWorkItem(LEAD_CTX, {
      title: "Test Item",
      description: "Test Description",
      category: "OPERATIONAL_TASK",
      teamId: FIN_TEAM_ID,
      priority: Priority.MEDIUM
    });
  });

  it("should handle concurrent identical idempotent requests", async () => {
    const key = "test-key-1";
    const body = { title: "Updated Title", version: 1 };
    const hash = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body });

    const requests = Array.from({ length: 5 }).map(() =>
      withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
        const item = await WorkItemService.updateWorkItem(testItem.id, LEAD_CTX, body, tx);
        return { statusCode: 200, responseBody: item };
      }).catch(e => e)
    );

    const results = await Promise.all(requests);
    
    let successes = 0;
    let replays = 0;

    for (const res of results) {
      if (res.replayed === false && res.statusCode === 200) successes++;
      if (res.replayed === true && res.statusCode === 200) replays++;
    }

    expect(successes).toBe(1);
    expect(replays).toBe(4);
    
    const record = await prisma.idempotencyRecord.findUnique({
      where: { userId_operation_key: { userId: LEAD_CTX.id, operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key } }
    });
    expect(record).not.toBeNull();
  });

  it("should reject key reuse with different hash", async () => {
    const key = "test-key-2";
    
    // First request
    const hash1 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1, title: "A" } });
    await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash1, async (tx) => {
        return { statusCode: 200, responseBody: { id: "a" } };
    });

    // Second request, same key, different body
    const hash2 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1, title: "B" } });
    
    await expect(
        withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash2, async (tx) => {
            return { statusCode: 200, responseBody: { id: "b" } };
        })
    ).rejects.toThrow(IdempotencyKeyReuseError);
  });

  it("should allow same key across different users", async () => {
    const key = "test-key-same";
    
    const hash1 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1 } });
    await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash1, async (tx) => {
        return { statusCode: 200, responseBody: { ok: true } };
    });

    const ADMIN_CTX2 = { id: PERSONAS.ADMIN.id, globalRole: "ADMIN", memberships: [] } as any;
    const hash2 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: ADMIN_CTX2.id, body: { version: 1 } });
    
    const res2 = await withIdempotency(ADMIN_CTX2.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash2, async (tx) => {
        return { statusCode: 200, responseBody: { ok: true } };
    });

    expect(res2.replayed).toBe(false);
  });

  it("should remove reservation and allow retry if transaction rolls back", async () => {
    const key = "test-key-rollback";
    const hash = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1 } });
    
    // Simulate error during mutation
    await expect(
        withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
            throw new Error("Simulated failure");
        })
    ).rejects.toThrow("Simulated failure");

    // Idempotency record should not exist
    const record = await prisma.idempotencyRecord.findUnique({
      where: { userId_operation_key: { userId: LEAD_CTX.id, operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key } }
    });
    expect(record).toBeNull();

    // Retry should succeed
    const res = await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
        return { statusCode: 200, responseBody: { success: true } };
    });
    expect(res.statusCode).toBe(200);
    expect(res.replayed).toBe(false);
  });
  
  it("activity query with cursor pagination", async () => {
      // already created testItem (1 activity)
      // add more activities
      for (let i = 0; i < 35; i++) {
        await WorkItemService.updateWorkItem(testItem.id, LEAD_CTX, { version: i + 1, description: `Desc ${i}`});
      }
      // total 36 activities
      
      const page1 = await ActivityQueryService.list(testItem.id, LEAD_CTX, { limit: 10 });
      expect(page1.items.length).toBe(10);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await ActivityQueryService.list(testItem.id, LEAD_CTX, { limit: 10, cursor: page1.nextCursor as string });
      expect(page2.items.length).toBe(10);
      expect(page2.nextCursor).toBeDefined();

      const all = await prisma.activity.findMany({ where: { workItemId: testItem.id }, orderBy: [{ createdAt: 'desc'}, { id: 'desc' }] });
      
      expect(page2.items[0].id).toBe(all[10].id);
  });
});
