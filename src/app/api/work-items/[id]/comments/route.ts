import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ActivityAction } from "@prisma/client";
import { canCreateInTeam } from "@/domain/work-item";
import { NotFoundError, ForbiddenError, InvalidRequestError } from "@/lib/errors";
import { z } from "zod";
import {
  computeRequestHash,
  findCompletedRecord,
  checkReplay,
  withIdempotency,
  IDEMPOTENCY_OPERATION,
} from "@/services/idempotency.service";
import { getIdempotencyKey } from "@/lib/api";

export const dynamic = "force-dynamic";

const CommentSchema = z.object({
  message: z.string().min(1).max(5000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userCtx = await authenticate(req);

    const item = await prisma.workItem.findUnique({
      where: { id: params.id },
      select: { id: true, teamId: true },
    });
    if (!item) throw new NotFoundError(`WorkItem '${params.id}' not found`);
    if (!canCreateInTeam(userCtx, item.teamId))
      throw new ForbiddenError("Viewers cannot add comments");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new InvalidRequestError("Request body must be valid JSON");
    }

    const parsed = CommentSchema.safeParse(body);
    if (!parsed.success)
      throw new InvalidRequestError("message is required (1-5000 chars)");

    const key = getIdempotencyKey(req);

    const requestHash = computeRequestHash({
      operation: IDEMPOTENCY_OPERATION.COMMENT_ADDED,
      resourceId: params.id,
      userId: userCtx.id,
      body: parsed.data,
    });

    const existing = await findCompletedRecord(
      userCtx.id,
      IDEMPOTENCY_OPERATION.COMMENT_ADDED,
      key
    );
    if (existing) {
      const replay = checkReplay(existing, requestHash);
      return apiResponse(replay.responseBody, replay.statusCode, {
        "Idempotent-Replayed": "true",
      });
    }

    const { statusCode, responseBody, replayed } = await withIdempotency(
      userCtx.id,
      IDEMPOTENCY_OPERATION.COMMENT_ADDED,
      key,
      requestHash,
      async (tx) => {
        const activity = await tx.activity.create({
          data: {
            workItemId: params.id,
            actorId: userCtx.id,
            action: ActivityAction.COMMENT_ADDED,
            details: { message: parsed.data.message },
          },
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
        });
        return { statusCode: 201, responseBody: activity };
      }
    );

    return apiResponse(responseBody, statusCode, replayed ? { "Idempotent-Replayed": "true" } : undefined);
  } catch (err) {
    return handleApiError(err);
  }
}
