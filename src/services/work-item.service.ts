import { prisma } from "../lib/prisma";
import { UserContext } from "../auth/context";
import { WorkItemRepository } from "../repositories/work-item.repository";
import {
  canReadTeam,
  canCreateInTeam,
  validateStatusTransition,
  validateClaimEligibility,
  validatePatchPermissions,
} from "../domain/work-item";
import {
  NotFoundError,
  ForbiddenError,
  StaleVersionError,
  AlreadyAssignedError,
  ClaimNotAllowedForStatusError,
} from "../lib/errors";
import { parseCreatePayload, parsePatchPayload } from "../validation/work-item";
import { ActivityAction, Status, Priority, Prisma } from "@prisma/client";

export class WorkItemService {
  static async createWorkItem(userCtx: UserContext, rawInput: unknown) {
    const input = parseCreatePayload(rawInput);

    if (!canCreateInTeam(userCtx, input.teamId)) {
      throw new ForbiddenError("You do not have permission to create work items in this team");
    }

    return await prisma.$transaction(async (tx) => {
      const createdItem = await tx.workItem.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          teamId: input.teamId,
          priority: input.priority ?? Priority.MEDIUM,
          status: Status.OPEN,
          createdById: userCtx.id,
          nextAction: input.nextAction ?? null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          version: 1,
        },
        include: {
          team: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      // Appends CREATED Activity
      await tx.activity.create({
        data: {
          workItemId: createdItem.id,
          actorId: userCtx.id,
          action: ActivityAction.CREATED,
          details: {
            title: createdItem.title,
            category: createdItem.category,
            priority: createdItem.priority,
          },
        },
      });

      return createdItem;
    });
  }

  static async updateWorkItem(id: string, userCtx: UserContext, rawInput: unknown) {
    const payload = parsePatchPayload(rawInput);
    const expectedVersion = payload.version;

    // Read current item
    const currentItem = await WorkItemRepository.findById(id);
    if (!currentItem) {
      throw new NotFoundError(`WorkItem '${id}' not found`);
    }

    if (!canReadTeam(userCtx, currentItem.teamId)) {
      throw new ForbiddenError("You do not have access to this work item");
    }

    // Validate patch permissions & filter actual changes
    const { filteredChanges, hasActualChanges } = validatePatchPermissions(
      userCtx,
      currentItem,
      payload
    );

    // Section 84: No-op PATCH returns 200 with current item without version increment or Activity
    if (!hasActualChanges) {
      return currentItem;
    }

    // Validate status transition if status is being changed
    if (filteredChanges.status) {
      validateStatusTransition(
        userCtx,
        currentItem.teamId,
        currentItem.status,
        filteredChanges.status
      );
    }

    // Validate assignee team membership if assigneeId is being changed to a non-null user
    if (filteredChanges.assigneeId) {
      await WorkItemRepository.validateAssigneeMembership(
        currentItem.teamId,
        filteredChanges.assigneeId
      );
    }

    // Execute atomic update & activity generation in single transaction
    return await prisma.$transaction(async (tx) => {
      const count = await WorkItemRepository.atomicUpdate(
        id,
        expectedVersion,
        filteredChanges,
        tx
      );

      if (count === 0) {
        throw new StaleVersionError();
      }

      // Generate Activity records for changed categories
      const activitiesToCreate: Array<Prisma.ActivityCreateManyInput> = [];

      if (filteredChanges.status) {
        activitiesToCreate.push({
          workItemId: id,
          actorId: userCtx.id,
          action: ActivityAction.STATUS_CHANGED,
          details: {
            from: currentItem.status,
            to: filteredChanges.status,
          },
        });
      }

      if (filteredChanges.priority) {
        activitiesToCreate.push({
          workItemId: id,
          actorId: userCtx.id,
          action: ActivityAction.PRIORITY_CHANGED,
          details: {
            from: currentItem.priority,
            to: filteredChanges.priority,
          },
        });
      }

      if (filteredChanges.assigneeId !== undefined) {
        if (filteredChanges.assigneeId === null) {
          activitiesToCreate.push({
            workItemId: id,
            actorId: userCtx.id,
            action: ActivityAction.UNASSIGNED,
            details: {
              from: currentItem.assigneeId,
              to: null,
            },
          });
        } else {
          activitiesToCreate.push({
            workItemId: id,
            actorId: userCtx.id,
            action: ActivityAction.ASSIGNED,
            details: {
              from: currentItem.assigneeId,
              to: filteredChanges.assigneeId,
            },
          });
        }
      }

      // Generic UPDATED activity for text/meta field changes (title, description, nextAction, dueAt)
      const otherUpdatedFields = [];
      if (filteredChanges.title) otherUpdatedFields.push("title");
      if (filteredChanges.description) otherUpdatedFields.push("description");
      if (filteredChanges.nextAction !== undefined) otherUpdatedFields.push("nextAction");
      if (filteredChanges.dueAt !== undefined) otherUpdatedFields.push("dueAt");

      if (otherUpdatedFields.length > 0) {
        activitiesToCreate.push({
          workItemId: id,
          actorId: userCtx.id,
          action: ActivityAction.UPDATED,
          details: {
            fields: otherUpdatedFields,
          },
        });
      }

      for (const act of activitiesToCreate) {
        await tx.activity.create({ data: act });
      }

      return await WorkItemRepository.findById(id, tx);
    });
  }

  static async claimWorkItem(id: string, userCtx: UserContext) {
    const currentItem = await WorkItemRepository.findById(id);
    if (!currentItem) {
      throw new NotFoundError(`WorkItem '${id}' not found`);
    }

    if (!canReadTeam(userCtx, currentItem.teamId)) {
      throw new ForbiddenError("You do not have access to this work item");
    }

    validateClaimEligibility(userCtx, currentItem.teamId, currentItem.status);

    // Atomic claim conditional update
    const result = await prisma.$transaction(async (tx) => {
      const count = await WorkItemRepository.atomicClaim(id, userCtx.id, tx);

      if (count === 1) {
        // Winner creates ASSIGNED activity
        await tx.activity.create({
          data: {
            workItemId: id,
            actorId: userCtx.id,
            action: ActivityAction.ASSIGNED,
            details: {
              from: null,
              to: userCtx.id,
              via: "claim",
            },
          },
        });
        return await WorkItemRepository.findById(id, tx);
      }
      return null;
    });

    if (result) {
      return result;
    }

    // Loser (count === 0): Perform fresh read to distinguish error per Section 22
    const freshRead = await WorkItemRepository.findById(id);
    if (!freshRead) {
      throw new NotFoundError(`WorkItem '${id}' not found`);
    }
    if (freshRead.status === Status.CLOSED) {
      throw new ClaimNotAllowedForStatusError("Claim is forbidden for CLOSED work items");
    }
    if (freshRead.assigneeId !== null) {
      throw new AlreadyAssignedError("Work item is already assigned to another user");
    }

    throw new StaleVersionError("Claim failed due to concurrent modification");
  }
}
