import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { WorkItemService } from '../src/services/workitem.service';
import { AuthorizationService } from '../src/services/auth.service';
import { IdempotencyService } from '../src/services/idempotency.service';
import { AsyncJobService } from '../src/services/job.service';
import { VersionMismatchError } from '../src/lib/errors';
import { Status, Priority, WorkItemType } from '@prisma/client';

describe('Newtonite Concurrency & Critical Behavior Suite (PostgreSQL Backed)', () => {
  let devUserCtx: any;
  let leadUserCtx: any;
  let engTeam: any;
  let testWorkItem: any;

  beforeEach(async () => {
    // Get test user contexts & engineering team from seeded db
    const devUser = await prisma.user.findUnique({ where: { email: 'dev.eng@newtonite.com' } });
    const leadUser = await prisma.user.findUnique({ where: { email: 'lead.eng@newtonite.com' } });
    engTeam = await prisma.team.findUnique({ where: { name: 'Engineering' } });

    expect(devUser).not.toBeNull();
    expect(leadUser).not.toBeNull();
    expect(engTeam).not.toBeNull();

    devUserCtx = await AuthorizationService.getUserContext(devUser!.id);
    leadUserCtx = await AuthorizationService.getUserContext(leadUser!.id);

    // Create a fresh test work item assigned to Engineering team
    testWorkItem = await WorkItemService.createWorkItem(devUserCtx, {
      title: 'Concurrency Test Item',
      description: 'Testing optimistic locking under high concurrency',
      type: WorkItemType.ENGINEERING_PROBLEM,
      priority: Priority.HIGH,
      assignedTeamId: engTeam.id,
    });
  });

  it('handles simultaneous edits with Version Mismatch Error (409 Conflict)', async () => {
    const initialVersion = testWorkItem.version;

    // Simulate two concurrent users reading version V and attempting to update simultaneously
    const promise1 = WorkItemService.updateWorkItem(testWorkItem.id, devUserCtx, {
      expectedVersion: initialVersion,
      title: 'Update by User A',
    });

    const promise2 = WorkItemService.updateWorkItem(testWorkItem.id, leadUserCtx, {
      expectedVersion: initialVersion,
      title: 'Update by User B',
    });

    // Execute concurrently using Promise.allSettled
    const results = await Promise.allSettled([promise1, promise2]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one update must succeed, and exactly one must fail due to VersionMismatchError
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(VersionMismatchError);
    expect(rejectionReason.message).toContain('modified by another user');

    // Verify DB state has version incremented to 2
    const freshItem = await prisma.workItem.findUnique({ where: { id: testWorkItem.id } });
    expect(freshItem?.version).toBe(initialVersion + 1);
  });

  it('prevents accidental duplicate operations using Idempotency Keys', async () => {
    const idempotencyKey = `key-test-${Date.now()}`;
    const reqPath = '/api/work-items/transition';

    // First request
    const firstCheck = await IdempotencyService.checkKey(idempotencyKey, reqPath);
    expect(firstCheck).toBeNull();

    const mockResponse = { success: true, workItemId: testWorkItem.id, newStatus: 'IN_PROGRESS' };
    await IdempotencyService.saveKey(idempotencyKey, reqPath, 200, mockResponse);

    // Duplicate request with same idempotency key
    const secondCheck = await IdempotencyService.checkKey(idempotencyKey, reqPath);
    expect(secondCheck).not.toBeNull();
    expect(secondCheck?.statusCode).toBe(200);
    expect(secondCheck?.body).toEqual(mockResponse);
  });

  it('enforces RBAC resource approval rules on workflow transitions', async () => {
    // Transition OPEN -> IN_PROGRESS
    const inProgressItem = await WorkItemService.transitionStatus(testWorkItem.id, devUserCtx, {
      expectedVersion: testWorkItem.version,
      newStatus: Status.IN_PROGRESS,
    });

    // Transition IN_PROGRESS -> PENDING_APPROVAL
    const pendingItem = await WorkItemService.transitionStatus(testWorkItem.id, devUserCtx, {
      expectedVersion: inProgressItem!.version,
      newStatus: Status.PENDING_APPROVAL,
    });

    expect(pendingItem?.status).toBe(Status.PENDING_APPROVAL);

    // Regular dev member attempts to approve (PENDING_APPROVAL -> RESOLVED) without Lead role
    await expect(
      WorkItemService.transitionStatus(testWorkItem.id, devUserCtx, {
        expectedVersion: pendingItem!.version,
        newStatus: Status.RESOLVED,
      })
    ).rejects.toThrow('Only Team Leads or Admins can approve work items');

    // Lead user approves - should succeed
    const approvedItem = await WorkItemService.transitionStatus(testWorkItem.id, leadUserCtx, {
      expectedVersion: pendingItem!.version,
      newStatus: Status.RESOLVED,
    });

    expect(approvedItem?.status).toBe(Status.RESOLVED);
  });

  it('processes background async jobs with retry and failure handling', async () => {
    const job = await AsyncJobService.enqueueJob('FAILING_TEST_JOB', { test: true });
    expect(job.status).toBe('PENDING');

    // Process job attempt 1 (fails, status remains PENDING for retry)
    const res1 = await AsyncJobService.processNextJob(job.id);
    expect(res1.processed).toBe(true);
    expect(res1.status).toBe('PENDING');

    // Process job attempt 2 (fails, status remains PENDING)
    await AsyncJobService.processNextJob(job.id);

    // Process job attempt 3 (max attempts reached -> FAILED)
    const res3 = await AsyncJobService.processNextJob(job.id);
    expect(res3.status).toBe('FAILED');
    expect(res3.error).toBe('Simulated external service failure');
  });
});
