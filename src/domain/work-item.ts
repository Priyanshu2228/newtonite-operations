import { Status, TeamRole, GlobalRole, Priority, Category } from "@prisma/client";
import { UserContext } from "../auth/context";
import {
  ForbiddenError,
  InvalidStatusTransitionError,
  ClaimNotAllowedForStatusError,
  AssigneeNotTeamMemberError,
  InvalidRequestError,
} from "../lib/errors";

export function canReadTeam(userCtx: UserContext, teamId: string): boolean {
  if (userCtx.globalRole === GlobalRole.ADMIN) {
    return true;
  }
  return userCtx.memberships.some((m) => m.teamId === teamId);
}

export function getUserTeamRole(userCtx: UserContext, teamId: string): TeamRole | null {
  const membership = userCtx.memberships.find((m) => m.teamId === teamId);
  return membership ? membership.teamRole : null;
}

export function canCreateInTeam(userCtx: UserContext, teamId: string): boolean {
  if (userCtx.globalRole === GlobalRole.ADMIN) {
    return true;
  }
  const role = getUserTeamRole(userCtx, teamId);
  return role === TeamRole.LEAD || role === TeamRole.MEMBER;
}

export function isValidStatusTransition(currentStatus: Status, newStatus: Status): boolean {
  if (currentStatus === newStatus) return true;

  const validMap: Record<Status, Status[]> = {
    [Status.OPEN]: [Status.IN_PROGRESS, Status.RESOLVED],
    [Status.IN_PROGRESS]: [Status.BLOCKED, Status.RESOLVED],
    [Status.BLOCKED]: [Status.IN_PROGRESS],
    [Status.RESOLVED]: [Status.CLOSED, Status.IN_PROGRESS],
    [Status.CLOSED]: [Status.IN_PROGRESS],
  };

  return validMap[currentStatus]?.includes(newStatus) ?? false;
}

export function validateStatusTransition(
  userCtx: UserContext,
  teamId: string,
  currentStatus: Status,
  newStatus: Status
) {
  if (currentStatus === newStatus) return;

  if (!isValidStatusTransition(currentStatus, newStatus)) {
    throw new InvalidStatusTransitionError(
      `Cannot transition status from ${currentStatus} to ${newStatus}`
    );
  }

  // CLOSED -> IN_PROGRESS is allowed only for ADMIN or LEAD of the team
  if (currentStatus === Status.CLOSED && newStatus === Status.IN_PROGRESS) {
    const isOwnerOrAdmin =
      userCtx.globalRole === GlobalRole.ADMIN || getUserTeamRole(userCtx, teamId) === TeamRole.LEAD;
    if (!isOwnerOrAdmin) {
      throw new ForbiddenError("Only Admin or Team Lead may reopen closed work items");
    }
  }
}

export function validateClaimEligibility(userCtx: UserContext, teamId: string, currentStatus: Status) {
  if (currentStatus === Status.CLOSED) {
    throw new ClaimNotAllowedForStatusError("Cannot claim a CLOSED work item");
  }

  const teamRole = getUserTeamRole(userCtx, teamId);
  // ADMIN can claim ONLY if Admin is also a member of that team with LEAD or MEMBER role
  const canClaim = teamRole === TeamRole.LEAD || teamRole === TeamRole.MEMBER;

  if (!canClaim) {
    throw new ForbiddenError("Only team Leads or Members can claim work items");
  }
}

export interface WorkItemUpdatePayload {
  version: number;
  title?: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  assigneeId?: string | null;
  nextAction?: string | null;
  dueAt?: Date | string | null;
}

export const PROTECTED_PATCH_FIELDS = ["id", "teamId", "createdById", "createdAt", "updatedAt", "activities"];

export function validatePatchPermissions(
  userCtx: UserContext,
  currentItem: {
    teamId: string;
    assigneeId: string | null;
    title: string;
    description: string;
    priority: Priority;
    status: Status;
    nextAction: string | null;
    dueAt: Date | null;
  },
  payload: Record<string, any>
): {
  filteredChanges: Partial<{
    title: string;
    description: string;
    priority: Priority;
    status: Status;
    assigneeId: string | null;
    nextAction: string | null;
    dueAt: Date | null;
  }>;
  hasActualChanges: boolean;
} {
  // Check for protected/immutable or unknown fields per Section 84
  for (const field of PROTECTED_PATCH_FIELDS) {
    if (field in payload) {
      throw new InvalidRequestError(`Field '${field}' is immutable or protected`);
    }
  }

  const allowedPayloadKeys = [
    "version",
    "title",
    "description",
    "priority",
    "status",
    "assigneeId",
    "nextAction",
    "dueAt",
  ];

  for (const key of Object.keys(payload)) {
    if (!allowedPayloadKeys.includes(key)) {
      throw new InvalidRequestError(`Unknown field '${key}' in patch body`);
    }
  }

  const teamRole = getUserTeamRole(userCtx, currentItem.teamId);
  const isAdmin = userCtx.globalRole === GlobalRole.ADMIN;
  const isLead = teamRole === TeamRole.LEAD;
  const isMember = teamRole === TeamRole.MEMBER;
  const isAssignedToSelf = currentItem.assigneeId === userCtx.id;

  if (!isAdmin && !isLead) {
    if (!isMember) {
      throw new ForbiddenError("Viewers or non-members cannot edit work items");
    }
    if (!isAssignedToSelf) {
      throw new ForbiddenError("Members can only edit work items assigned to themselves");
    }
  }

  // Allowed fields by role:
  // ADMIN & LEAD: title, description, priority, status, assigneeId, nextAction, dueAt
  // MEMBER: title, description, status ONLY
  const isFullEditor = isAdmin || isLead;
  const filteredChanges: any = {};

  const checkField = (
    field: string,
    newValue: any,
    currentValue: any,
    isAllowedForRole: boolean
  ) => {
    if (newValue === undefined) return;

    // Normalizing Date comparison
    const isSameDate =
      newValue instanceof Date &&
      currentValue instanceof Date &&
      newValue.getTime() === currentValue.getTime();

    const isSame = newValue === currentValue || isSameDate;

    if (!isAllowedForRole) {
      if (!isSame) {
        throw new ForbiddenError(`Your role does not have permission to modify field '${field}'`);
      }
      // If same value, ignore per Section 84
      return;
    }

    if (!isSame) {
      filteredChanges[field] = newValue;
    }
  };

  checkField("title", payload.title, currentItem.title, true);
  checkField("description", payload.description, currentItem.description, true);
  checkField("status", payload.status, currentItem.status, true);

  checkField("priority", payload.priority, currentItem.priority, isFullEditor);
  checkField("assigneeId", payload.assigneeId, currentItem.assigneeId, isFullEditor);
  checkField("nextAction", payload.nextAction, currentItem.nextAction, isFullEditor);

  const parsedDueAt = payload.dueAt !== undefined ? (payload.dueAt ? new Date(payload.dueAt) : null) : undefined;
  checkField("dueAt", parsedDueAt, currentItem.dueAt, isFullEditor);

  const hasActualChanges = Object.keys(filteredChanges).length > 0;

  return { filteredChanges, hasActualChanges };
}

export function isOverdue(dueAt: Date | null, status: Status): boolean {
  if (!dueAt) return false;
  if (status === Status.RESOLVED || status === Status.CLOSED) return false;
  return dueAt.getTime() < Date.now();
}
