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
  StaleVersionError,
  InvalidRequestError
} from "../src/lib/errors";

let FIN_TEAM_ID: string;
let ENG_TEAM_ID: string;

const ADMIN_CTX = { id: PERSONAS.ADMIN.id, globalRole: "ADMIN", memberships: [] } as any;
const LEAD_CTX = { id: PERSONAS.FINANCE_LEAD.id, globalRole: "USER", memberships: [] } as any; 

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

    const engTeam = await prisma.team.create({
      data: { name: "Engineering", description: "Eng Team" }
    });
    ENG_TEAM_ID = engTeam.id;

    LEAD_CTX.memberships = [{ teamId: FIN_TEAM_ID, teamRole: "LEAD" }];

    testItem = await WorkItemService.createWorkItem(LEAD_CTX, {
      title: "Test Item",
      description: "Test Description",
      category: "OPERATIONAL_TASK",
      teamId: FIN_TEAM_ID,
      priority: Priority.MEDIUM
    });
  });

  describe("Idempotency", () => {
    it("should handle concurrent identical idempotent requests (SPEC §57.2)", async () => {
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
    });

    it("should reject key reuse with different hash (SPEC §57.3)", async () => {
      const key = "test-key-2";
      
      const hash1 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1, title: "A" } });
      await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash1, async (tx) => {
          return { statusCode: 200, responseBody: { id: "a" } };
      });

      const hash2 = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1, title: "B" } });
      
      await expect(
          withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash2, async (tx) => {
              return { statusCode: 200, responseBody: { id: "b" } };
          })
      ).rejects.toThrow(IdempotencyKeyReuseError);
    });

    it("should allow same key across different users (SPEC §57.4)", async () => {
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

    it("should remove reservation and allow retry if transaction rolls back (SPEC §57.5)", async () => {
      const key = "test-key-rollback";
      const hash = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body: { version: 1 } });
      
      await expect(
          withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
              throw new Error("Simulated failure");
          })
      ).rejects.toThrow("Simulated failure");

      const record = await prisma.idempotencyRecord.findUnique({
        where: { userId_operation_key: { userId: LEAD_CTX.id, operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key } }
      });
      expect(record).toBeNull();

      const res = await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
          return { statusCode: 200, responseBody: { success: true } };
      });
      expect(res.statusCode).toBe(200);
      expect(res.replayed).toBe(false);
    });

    it("should replay successful response even if state has changed (SPEC §58)", async () => {
      const key = "test-key-replay-state-change";
      const body = { version: 1, title: "Title A" };
      const hash = computeRequestHash({ operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, resourceId: testItem.id, userId: LEAD_CTX.id, body });
      
      // Request 1 completes successfully
      const res1 = await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
          const item = await WorkItemService.updateWorkItem(testItem.id, LEAD_CTX, body, tx);
          return { statusCode: 200, responseBody: item };
      });
      expect(res1.statusCode).toBe(200);

      // Mutate the resource separately (version becomes 2)
      await WorkItemService.updateWorkItem(testItem.id, LEAD_CTX, { version: 2, title: "Title B" });

      // Request 2 (replay) with the same key and hash. It should bypass StaleVersionError and just return the cached res1
      const res2 = await withIdempotency(LEAD_CTX.id, IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM, key, hash, async (tx) => {
          // This block should NOT be executed
          throw new Error("Should not execute mutation block on replay");
      });
      
      expect(res2.replayed).toBe(true);
      expect((res2.responseBody as any).title).toBe("Title A");
    });
  });

  describe("Pagination and Listing", () => {
    it("should offset paginate work items with correct deterministic ordering", async () => {
      // Create 5 items with identical timestamps
      const now = new Date();
      await prisma.workItem.createMany({
        data: Array.from({ length: 5 }).map((_, i) => ({
          title: `Pagination Item ${i}`,
          description: "Desc",
          category: "OPERATIONAL_TASK",
          priority: Priority.MEDIUM,
          status: Status.OPEN,
          teamId: FIN_TEAM_ID,
          createdById: LEAD_CTX.id,
          version: 1,
          createdAt: now,
          updatedAt: now,
        }))
      });

      const page1 = await WorkItemQueryService.list(ADMIN_CTX, { limit: 3, sort: "updatedAt", sortDir: "desc" });
      expect(page1.items.length).toBe(3);
      expect(page1.total).toBeGreaterThanOrEqual(5);

      const page2 = await WorkItemQueryService.list(ADMIN_CTX, { limit: 3, page: 2, sort: "updatedAt", sortDir: "desc" });
      expect(page2.items.length).toBe(page1.total - 3);

      // Verify tiebreaker (id desc) is respected among the 5 items created at the same time
      const allItems = await prisma.workItem.findMany({ 
        where: { createdAt: now },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      });

      expect(page1.items[0].id).toBe(allItems[0].id);
      expect(page1.items[1].id).toBe(allItems[1].id);
      expect(page1.items[2].id).toBe(allItems[2].id);
      expect(page2.items[0].id).toBe(allItems[3].id);
    });

    it("activity query with cursor pagination handles identical timestamps properly", async () => {
      const now = new Date();
      await prisma.activity.createMany({
        data: Array.from({ length: 15 }).map((_, i) => ({
          workItemId: testItem.id,
          actorId: LEAD_CTX.id,
          action: ActivityAction.UPDATED,
          details: { index: i },
          createdAt: now
        }))
      });

      const page1 = await ActivityQueryService.list(testItem.id, LEAD_CTX, { limit: 10 });
      expect(page1.items.length).toBe(10);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await ActivityQueryService.list(testItem.id, LEAD_CTX, { limit: 10, cursor: page1.nextCursor as string });
      expect(page2.items.length).toBe(6); // 1 original + 15 new = 16. page1 had 10, page2 has 6.
      expect(page2.nextCursor).toBeNull();

      // Tiebreaker check
      const all = await prisma.activity.findMany({ 
        where: { workItemId: testItem.id }, 
        orderBy: [{ createdAt: 'desc'}, { id: 'desc' }] 
      });
      
      expect(page1.items[9].id).toBe(all[9].id);
      expect(page2.items[0].id).toBe(all[10].id);
    });
  });
});
