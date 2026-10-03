import { prisma } from '@/lib/prisma';
import { Status, Priority, WorkItemType } from '@prisma/client';
import { AuthorizationService, UserContext } from './auth.service';
import { WorkflowService } from './workflow.service';
import { AsyncJobService } from './job.service';
import { VersionMismatchError, AuthorizationError, ValidationError } from '@/lib/errors';

export interface CreateWorkItemInput {
  title: string;
  description: string;
  type: WorkItemType;
  priority?: Priority;
  assignedTeamId?: string;
  assignedToId?: string;
  tags?: string[];
}

export interface UpdateWorkItemInput {
  expectedVersion: number;
  title?: string;
  description?: string;
  priority?: Priority;
  assignedTeamId?: string;
  assignedToId?: string;
  tags?: string[];
}

export interface TransitionWorkItemInput {
  expectedVersion: number;
  newStatus: Status;
  reason?: string;
}

export class WorkItemService {
  static async getWorkItemById(id: string) {
    return await prisma.workItem.findUnique({
      where: { id },
      include: {
        assignedTeam: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        activityLogs: {
          include: { actor: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
        comments: {
          include: { author: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  static async createWorkItem(userCtx: UserContext, input: CreateWorkItemInput) {
    const authCheck = AuthorizationService.canPerformAction(userCtx, 'CREATE');
    if (!authCheck.allowed) {
      throw new AuthorizationError(authCheck.reason || 'Unauthorized action');
    }

    const item = await prisma.workItem.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority || Priority.MEDIUM,
        status: Status.OPEN,
        version: 1,
        assignedTeamId: input.assignedTeamId || null,
        assignedToId: input.assignedToId || null,
        createdById: userCtx.id,
        tags: input.tags || [],
      },
    });

    // Create immutable audit log
    await prisma.activityLog.create({
      data: {
        workItemId: item.id,
        actorId: userCtx.id,
        action: 'CREATED',
        details: { initialStatus: item.status, priority: item.priority, type: item.type },
      },
    });

    // Enqueue async job for background notification
    await AsyncJobService.enqueueJob('WORK_ITEM_CREATED_NOTIFY', {
      workItemId: item.id,
      title: item.title,
      createdById: userCtx.id,
    });

    return item;
  }

  static async updateWorkItem(id: string, userCtx: UserContext, input: UpdateWorkItemInput) {
    const existing = await this.getWorkItemById(id);
    if (!existing) {
      throw new ValidationError(`WorkItem ${id} not found`);
    }

    const authCheck = AuthorizationService.canPerformAction(userCtx, 'UPDATE', {
      assignedTeamId: existing.assignedTeamId,
      createdById: existing.createdById,
    });
    if (!authCheck.allowed) {
      throw new AuthorizationError(authCheck.reason || 'Unauthorized update');
    }

    // Execute Optimistic Concurrency Lock update
    const result = await prisma.workItem.updateMany({
      where: {
        id,
        version: input.expectedVersion,
      },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.assignedTeamId !== undefined && { assignedTeamId: input.assignedTeamId }),
        ...(input.assignedToId !== undefined && { assignedToId: input.assignedToId }),
        ...(input.tags !== undefined && { tags: input.tags }),
        version: input.expectedVersion + 1,
      },
    });

    if (result.count === 0) {
      throw new VersionMismatchError(
        `Conflict: Work item ${id} was modified by another user (expected version ${input.expectedVersion}).`
      );
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        workItemId: id,
        actorId: userCtx.id,
        action: 'UPDATED',
        details: JSON.parse(JSON.stringify({
          expectedVersion: input.expectedVersion,
          newVersion: input.expectedVersion + 1,
          changes: input,
        })),
      },
    });

    return await this.getWorkItemById(id);
  }

  static async transitionStatus(id: string, userCtx: UserContext, input: TransitionWorkItemInput) {
    const existing = await this.getWorkItemById(id);
    if (!existing) {
      throw new ValidationError(`WorkItem ${id} not found`);
    }

    const isTeamLeadOrAdmin = existing.assignedTeamId
      ? AuthorizationService.getUserRoleInTeam(userCtx, existing.assignedTeamId) === 'LEAD'
      : userCtx.role === 'ADMIN';

    // Check action auth
    const isApproval = input.newStatus === Status.RESOLVED && existing.status === Status.PENDING_APPROVAL;
    const authCheck = AuthorizationService.canPerformAction(
      userCtx,
      isApproval ? 'APPROVE' : 'TRANSITION',
      { assignedTeamId: existing.assignedTeamId, createdById: existing.createdById }
    );
    if (!authCheck.allowed) {
      throw new AuthorizationError(authCheck.reason || 'Unauthorized transition');
    }

    // Check state machine rule
    const workflowCheck = WorkflowService.validateTransition(existing.status, input.newStatus, isTeamLeadOrAdmin);
    if (!workflowCheck.allowed) {
      throw new ValidationError(workflowCheck.reason || 'Invalid workflow transition');
    }

    // Perform optimistic lock state transition
    const result = await prisma.workItem.updateMany({
      where: {
        id,
        version: input.expectedVersion,
      },
      data: {
        status: input.newStatus,
        version: input.expectedVersion + 1,
      },
    });

    if (result.count === 0) {
      throw new VersionMismatchError(
        `Conflict: Work item ${id} was modified by another user (expected version ${input.expectedVersion}).`
      );
    }

    await prisma.activityLog.create({
      data: {
        workItemId: id,
        actorId: userCtx.id,
        action: isApproval ? 'APPROVED' : 'STATUS_CHANGED',
        details: {
          oldStatus: existing.status,
          newStatus: input.newStatus,
          reason: input.reason || null,
          version: input.expectedVersion + 1,
        },
      },
    });

    return await this.getWorkItemById(id);
  }

  static async assignWorkItem(id: string, userCtx: UserContext, expectedVersion: number, newAssigneeId: string | null) {
    const existing = await this.getWorkItemById(id);
    if (!existing) {
      throw new ValidationError(`WorkItem ${id} not found`);
    }

    const authCheck = AuthorizationService.canPerformAction(userCtx, 'ASSIGN', {
      assignedTeamId: existing.assignedTeamId,
      createdById: existing.createdById,
    });
    if (!authCheck.allowed) {
      throw new AuthorizationError(authCheck.reason || 'Unauthorized assignment');
    }

    const result = await prisma.workItem.updateMany({
      where: {
        id,
        version: expectedVersion,
      },
      data: {
        assignedToId: newAssigneeId,
        version: expectedVersion + 1,
      },
    });

    if (result.count === 0) {
      throw new VersionMismatchError(
        `Conflict: Work item ${id} was modified by another user (expected version ${expectedVersion}).`
      );
    }

    await prisma.activityLog.create({
      data: {
        workItemId: id,
        actorId: userCtx.id,
        action: 'REASSIGNED',
        details: {
          oldAssigneeId: existing.assignedToId,
          newAssigneeId,
          version: expectedVersion + 1,
        },
      },
    });

    if (newAssigneeId) {
      await AsyncJobService.enqueueJob('NOTIFY_REASSIGNMENT', {
        workItemId: id,
        assignedToId: newAssigneeId,
        assignedBy: userCtx.id,
      });
    }

    return await this.getWorkItemById(id);
  }

  static async addComment(id: string, userCtx: UserContext, content: string) {
    const existing = await this.getWorkItemById(id);
    if (!existing) {
      throw new ValidationError(`WorkItem ${id} not found`);
    }

    const authCheck = AuthorizationService.canPerformAction(userCtx, 'COMMENT');
    if (!authCheck.allowed) {
      throw new AuthorizationError(authCheck.reason || 'Unauthorized comment');
    }

    const comment = await prisma.comment.create({
      data: {
        workItemId: id,
        authorId: userCtx.id,
        content,
      },
    });

    await prisma.activityLog.create({
      data: {
        workItemId: id,
        actorId: userCtx.id,
        action: 'COMMENTED',
        details: { commentId: comment.id },
      },
    });

    return comment;
  }
}
