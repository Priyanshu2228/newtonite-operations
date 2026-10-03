import { NextRequest, NextResponse } from "next/server";
import { getUserContext, UserContext } from "../auth/context";
import { validateIdempotencyKey } from "../services/idempotency.service";
import { AppError, formatErrorResponse, UnauthenticatedError } from "./errors";

export async function authenticate(req: NextRequest): Promise<UserContext> {
  const userId = req.headers.get("x-user-id");
  return getUserContext(userId);
}

export function getIdempotencyKey(req: NextRequest): string {
  const key = req.headers.get("x-idempotency-key");
  return validateIdempotencyKey(key);
}

export function apiResponse(body: unknown, status = 200, extra?: Record<string, string>): NextResponse {
  const res = NextResponse.json(body, { status });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      res.headers.set(k, v);
    }
  }
  return res;
}

export function handleApiError(err: unknown): NextResponse {
  const { status, body } = formatErrorResponse(err);
  return NextResponse.json(body, { status });
}
