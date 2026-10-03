import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { getUserContext } from "../src/auth/context";
import { WorkItemService } from "../src/services/work-item.service";
import { PERSONAS } from "../src/lib/personas";
import {
  StaleVersionError,
  AlreadyAssignedError,
  ForbiddenError,
  InvalidStatusTransitionError,
  ClaimNotAllowedForStatusError,
  AssigneeNotTeamMemberError,
  InvalidRequestError,
} from "../src/lib/errors";
import { Category, Priority, Status, ActivityAction } from "@prisma/client";

describe("Session 1 Integration Test Suite (Real PostgreSQL)", () => {
  let adminCtx: any;
  let finLeadCtx: any;
  let finMember1Ctx: any;
  let finMember2Ctx: any;
  let engMemberCtx: any;
  let engViewerCtx: any;

  let financeTeam: any;
  let engTeam: any;

  beforeEach(async () => {
    // Load contexts from seeded database
    adminCtx = await getUserContext(PERSONAS.ADMIN.id);
    finLeadCtx = await getUserContext(PERSONAS.FINANCE_LEAD.id);
    finMember1Ctx = await getUserContext(PERSONAS.FINANCE_MEMBER_1.id);
    finMember2Ctx = await getUserContext(PERSONAS.FINANCE_MEMBER_2.id);
    engMemberCtx = await getUserContext(PERSONAS.ENGINEERING_MEMBER.id);
    engViewerCtx = await getUserContext(PERSONAS.ENGINEERING_VIEWER.id);

    financeTeam = await prisma.team.findUniqueOrThrow({ where: { name: "Finance" } });
    engTeam = await prisma.team.findUniqueOrThrow({ where: { name: "Engineering" } });
  });

  // -------------------------------------------------------------
  // 1. CONCURRENT CLAIM TEST (SPEC Section 55)
  // -------------------------------------------------------------
  it("handles concurrent claim with exactly 1 winner and 4 ALREADY_ASSIGNED failures", async () => {
    // Create 3 extra fixture users in Finance team so we have 5 total eligible claimants
    const extraUser1 = await prisma.user.create({
      data: { name: "Claimant 1", email: "claimant1@test.local" },
    });
    const extraUser2 = await prisma.user.create({
      data: { name: "Claimant 2", email: "claimant2@test.local" },
    });
    const extraUser3 = await prisma.user.create({
      data: { name: "Claimant 3", email: "claimant3@test.local" },
    });

    await prisma.teamMember.createMany({
      data: [
        { userId: extraUser1.id, teamId: financeTeam.id, teamRole: "MEMBER" },
        { userId: extraUser2.id, teamId: financeTeam.id, teamRole: "MEMBER" },
        { userId: extraUser3.id, teamId: financeTeam.id, teamRole: "MEMBER" },
      ],
    });

    const claimantCtxs = [
      finLeadCtx,
      finMember1Ctx,
      await getUserContext(extraUser1.id),
      await getUserContext(extraUser2.id),
      await getUserContext(extraUser3.id),
    ];

    expect(claimantCtxs).toHaveLength(5);

    // Create fresh unassigned WorkItem in Finance
    const item = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "Concurrent Claim Fixture Item",
      description: "Testing 5-way concurrent claim",
      category: Category.INCIDENT,
      teamId: financeTeam.id,
    });

    expect(item.assigneeId).toBeNull();
    const initialVersion = item.version;

    // Launch 5 simultaneous claim requests
    const claimPromises = claimantCtxs.map((ctx) => WorkItemService.claimWorkItem(item.id, ctx));
    const results = await Promise.allSettled(claimPromises);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Assert: Exactly 1 succeeds, 4 fail with ALREADY_ASSIGNED
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    for (const rej of rejected) {
      const reason = (rej as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(AlreadyAssignedError);
      expect(reason.code).toBe("ALREADY_ASSIGNED");
    }

    // Assert DB state: exactly 1 assignee exists, version incremented once
    const updated = await prisma.workItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updated.assigneeId).not.toBeNull();
    expect(updated.version).toBe(initialVersion + 1);

    // Assert exactly 1 ASSIGNED Activity exists for this item with via: "claim"
    const assignActivities = await prisma.activity.findMany({
      where: {
        workItemId: item.id,
        action: ActivityAction.ASSIGNED,
      },
    });

    expect(assignActivities).toHaveLength(1);
    expect((assignActivities[0].details as any)?.via).toBe("claim");
  });

  // -------------------------------------------------------------
  // 2. OCC TEST (SPEC Section 56)
  // -------------------------------------------------------------
  it("enforces Optimistic Concurrency Control on simultaneous PATCH updates", async () => {
    const item = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "OCC Test Fixture Item",
      description: "Testing race condition between 2 users reading same version",
      category: Category.PAYMENT_INVESTIGATION,
      teamId: financeTeam.id,
    });

    const v = item.version;

    // Two simultaneous PATCH updates by authorized users with the same expected version
    const promise1 = WorkItemService.updateWorkItem(item.id, finLeadCtx, {
      version: v,
      title: "Title updated by User 1",
    });

    const promise2 = WorkItemService.updateWorkItem(item.id, adminCtx, {
      version: v,
      title: "Title updated by Admin",
    });

    const results = await Promise.allSettled([promise1, promise2]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(StaleVersionError);
    expect(error.code).toBe("STALE_VERSION");

    const freshItem = await prisma.workItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(freshItem.version).toBe(v + 1);
  });

  // -------------------------------------------------------------
  // 3. RBAC & PERMISSION TESTS (SPEC Section 59)
  // -------------------------------------------------------------
  it("enforces RBAC rules for create, update, and claim", async () => {
    // Viewer cannot create work items
    await expect(
      WorkItemService.createWorkItem(engViewerCtx, {
        title: "Viewer Create Attempt",
        description: "Should fail",
        category: Category.INCIDENT,
        teamId: engTeam.id,
      })
    ).rejects.toThrow(ForbiddenError);

    // Member cannot create in a team they do not belong to (e.g. Engineering Member in Finance)
    await expect(
      WorkItemService.createWorkItem(engMemberCtx, {
        title: "Cross Team Create Attempt",
        description: "Should fail",
        category: Category.INCIDENT,
        teamId: financeTeam.id,
      })
    ).rejects.toThrow(ForbiddenError);

    // Member cannot edit item assigned to someone else
    const itemAssignedToLead = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "Lead Item",
      description: "Assigned to lead",
      category: Category.OPERATIONAL_TASK,
      teamId: financeTeam.id,
    });
    await WorkItemService.updateWorkItem(itemAssignedToLead.id, finLeadCtx, {
      version: itemAssignedToLead.version,
      assigneeId: finLeadCtx.id,
    });

    const updatedAssigned = await prisma.workItem.findUniqueOrThrow({
      where: { id: itemAssignedToLead.id },
    });

    await expect(
      WorkItemService.updateWorkItem(updatedAssigned.id, finMember1Ctx, {
        version: updatedAssigned.version,
        title: "Unauthorized Member Edit",
      })
    ).rejects.toThrow(ForbiddenError);

    // Assignee must belong to WorkItem team with LEAD or MEMBER role (VIEWER cannot be assigned)
    const item = await WorkItemService.createWorkItem(engMemberCtx, {
      title: "Viewer Assignment Test",
      description: "Testing viewer assignment rejection",
      category: Category.INCIDENT,
      teamId: engTeam.id,
    });

    await expect(
      WorkItemService.updateWorkItem(item.id, adminCtx, {
        version: item.version,
        assigneeId: engViewerCtx.id,
      })
    ).rejects.toThrow(AssigneeNotTeamMemberError);
  });

  // -------------------------------------------------------------
  // 4. WORKFLOW STATUS TRANSITION TESTS (SPEC Section 60)
  // -------------------------------------------------------------
  it("validates workflow status transitions and reopening rules", async () => {
    const item = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "Workflow Transition Item",
      description: "Testing transitions",
      category: Category.COMPLIANCE,
      teamId: financeTeam.id,
    });

    // OPEN -> IN_PROGRESS (valid)
    const inProgress = await WorkItemService.updateWorkItem(item.id, finLeadCtx, {
      version: item.version,
      status: Status.IN_PROGRESS,
    });
    expect(inProgress).not.toBeNull();
    expect(inProgress!.status).toBe(Status.IN_PROGRESS);

    // IN_PROGRESS -> RESOLVED (valid)
    const resolved = await WorkItemService.updateWorkItem(inProgress!.id, finLeadCtx, {
      version: inProgress!.version,
      status: Status.RESOLVED,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.status).toBe(Status.RESOLVED);

    // RESOLVED -> CLOSED (valid)
    const closed = await WorkItemService.updateWorkItem(resolved!.id, finLeadCtx, {
      version: resolved!.version,
      status: Status.CLOSED,
    });
    expect(closed).not.toBeNull();
    expect(closed!.status).toBe(Status.CLOSED);

    // Claim on CLOSED item is forbidden (422 CLAIM_NOT_ALLOWED_FOR_STATUS)
    await expect(WorkItemService.claimWorkItem(closed!.id, finLeadCtx)).rejects.toThrow(
      ClaimNotAllowedForStatusError
    );

    // CLOSED -> IN_PROGRESS reopening by Member should be rejected (403 FORBIDDEN)
    await expect(
      WorkItemService.updateWorkItem(closed!.id, finMember1Ctx, {
        version: closed!.version,
        status: Status.IN_PROGRESS,
      })
    ).rejects.toThrow(ForbiddenError);

    // CLOSED -> IN_PROGRESS reopening by Lead should succeed
    const reopened = await WorkItemService.updateWorkItem(closed!.id, finLeadCtx, {
      version: closed!.version,
      status: Status.IN_PROGRESS,
    });
    expect(reopened).not.toBeNull();
    expect(reopened!.status).toBe(Status.IN_PROGRESS);

    // Invalid transition: OPEN -> CLOSED directly should fail (422 INVALID_STATUS_TRANSITION)
    const freshItem = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "Invalid Transition Item",
      description: "Testing direct OPEN -> CLOSED",
      category: Category.APPROVAL,
      teamId: financeTeam.id,
    });

    await expect(
      WorkItemService.updateWorkItem(freshItem.id, finLeadCtx, {
        version: freshItem.version,
        status: Status.CLOSED,
      })
    ).rejects.toThrow(InvalidStatusTransitionError);
  });

  // -------------------------------------------------------------
  // 5. PATCH FIELD VALIDATION & NO-OP TESTS (SPEC Section 61 & 84)
  // -------------------------------------------------------------
  it("rejects protected/unknown fields and handles no-op PATCH correctly", async () => {
    const item = await WorkItemService.createWorkItem(finLeadCtx, {
      title: "Patch Validation Item",
      description: "Testing patch field rules",
      category: Category.OPERATIONAL_TASK,
      teamId: financeTeam.id,
    });

    // Protected field (e.g. teamId or id) causes 400 INVALID_REQUEST
    await expect(
      WorkItemService.updateWorkItem(item.id, finLeadCtx, {
        version: item.version,
        teamId: engTeam.id,
      })
    ).rejects.toThrow(InvalidRequestError);

    // Unknown field causes 400 INVALID_REQUEST
    await expect(
      WorkItemService.updateWorkItem(item.id, finLeadCtx, {
        version: item.version,
        fooBarUnknownField: "test",
      } as any)
    ).rejects.toThrow(InvalidRequestError);

    // No-Op PATCH: Sending same existing values returns 200 without version increment or Activity
    const countBefore = await prisma.activity.count({ where: { workItemId: item.id } });
    const noOpResult = await WorkItemService.updateWorkItem(item.id, finLeadCtx, {
      version: item.version,
      title: item.title, // unchanged
    });

    expect(noOpResult).not.toBeNull();
    expect(noOpResult!.version).toBe(item.version); // version unchanged
    const countAfter = await prisma.activity.count({ where: { workItemId: item.id } });
    expect(countAfter).toBe(countBefore); // no new Activity
  });
});
