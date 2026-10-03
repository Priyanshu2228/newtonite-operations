export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class InvalidRequestError extends AppError {
  constructor(message = "Invalid request payload or parameters") {
    super("INVALID_REQUEST", 400, message);
  }
}

export class IdempotencyKeyRequiredError extends AppError {
  constructor(message = "X-Idempotency-Key header is required") {
    super("IDEMPOTENCY_KEY_REQUIRED", 400, message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "User context missing or unauthenticated") {
    super("UNAUTHENTICATED", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Permission denied for this operation") {
    super("FORBIDDEN", 403, message);
  }
}

export class AssigneeNotTeamMemberError extends AppError {
  constructor(message = "Assignee must be a LEAD or MEMBER of the WorkItem's team") {
    super("ASSIGNEE_NOT_TEAM_MEMBER", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Work item not found") {
    super("NOT_FOUND", 404, message);
  }
}

export class IdempotencyKeyReuseError extends AppError {
  constructor(message = "Idempotency key reused with different request payload") {
    super("IDEMPOTENCY_KEY_REUSE", 409, message);
  }
}

export class StaleVersionError extends AppError {
  constructor(message = "The work item has changed. Reload the latest version.") {
    super("STALE_VERSION", 409, message);
  }
}

export class AlreadyAssignedError extends AppError {
  constructor(message = "Work item is already assigned to another user") {
    super("ALREADY_ASSIGNED", 409, message);
  }
}

export class InvalidStatusTransitionError extends AppError {
  constructor(message = "Invalid status transition") {
    super("INVALID_STATUS_TRANSITION", 422, message);
  }
}

export class ClaimNotAllowedForStatusError extends AppError {
  constructor(message = "Claim is forbidden for CLOSED work items") {
    super("CLAIM_NOT_ALLOWED_FOR_STATUS", 422, message);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected server error occurred") {
    super("INTERNAL_ERROR", 500, message);
  }
}

export function formatErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
        },
      },
    };
  }

  console.error("Unhandled Server Error:", error);
  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred",
      },
    },
  };
}
