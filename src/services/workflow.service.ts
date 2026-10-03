import { Status } from '@prisma/client';

export interface TransitionRule {
  from: Status;
  to: Status;
  requiresLeadApproval?: boolean;
}

const ALLOWED_TRANSITIONS: TransitionRule[] = [
  { from: Status.OPEN, to: Status.IN_PROGRESS },
  { from: Status.OPEN, to: Status.CLOSED },
  { from: Status.IN_PROGRESS, to: Status.PENDING_APPROVAL },
  { from: Status.IN_PROGRESS, to: Status.RESOLVED },
  { from: Status.IN_PROGRESS, to: Status.OPEN },
  { from: Status.IN_PROGRESS, to: Status.CLOSED },
  { from: Status.PENDING_APPROVAL, to: Status.RESOLVED, requiresLeadApproval: true },
  { from: Status.PENDING_APPROVAL, to: Status.IN_PROGRESS }, // Rejected approval
  { from: Status.PENDING_APPROVAL, to: Status.CLOSED },
  { from: Status.RESOLVED, to: Status.CLOSED },
  { from: Status.RESOLVED, to: Status.IN_PROGRESS }, // Reopened
  { from: Status.CLOSED, to: Status.OPEN, requiresLeadApproval: true }, // Reopened by lead
];

export class WorkflowService {
  static validateTransition(
    currentStatus: Status,
    newStatus: Status,
    isTeamLeadOrAdmin: boolean
  ): { allowed: boolean; reason?: string } {
    if (currentStatus === newStatus) {
      return { allowed: true };
    }

    const rule = ALLOWED_TRANSITIONS.find((t) => t.from === currentStatus && t.to === newStatus);

    if (!rule) {
      return {
        allowed: false,
        reason: `Invalid state transition from ${currentStatus} to ${newStatus}`,
      };
    }

    if (rule.requiresLeadApproval && !isTeamLeadOrAdmin) {
      return {
        allowed: false,
        reason: `Transitioning from ${currentStatus} to ${newStatus} requires Team Lead or Admin approval`,
      };
    }

    return { allowed: true };
  }
}
