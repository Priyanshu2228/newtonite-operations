import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse, getIdempotencyKey } from "@/lib/api";
import { WorkItemQueryService } from "@/services/query.service";
import { WorkItemService } from "@/services/work-item.service";
import {
  computeRequestHash,
  findCompletedRecord,
  checkReplay,
  withIdempotency,
  IDEMPOTENCY_OPERATION,
} from "@/services/idempotency.service";
import { InvalidRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const item = await WorkItemQueryService.getById(params.id, userCtx);
    return apiResponse(item);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const key = getIdempotencyKey(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new InvalidRequestError("Request body must be valid JSON");
    }

    const requestHash = computeRequestHash({
      operation: IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM,
      resourceId: params.id,
      userId: userCtx.id,
      body,
    });

    // Check for existing completed record BEFORE auth/state validation (SPEC §26)
    const existing = await findCompletedRecord(
      userCtx.id,
      IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM,
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
      IDEMPOTENCY_OPERATION.PATCH_WORK_ITEM,
      key,
      requestHash,
      async (tx) => {
        const item = await WorkItemService.updateWorkItem(params.id, userCtx, body, tx);
        return { statusCode: 200, responseBody: item };
      }
    );

    return apiResponse(responseBody, statusCode, replayed ? { "Idempotent-Replayed": "true" } : undefined);
  } catch (err) {
    return handleApiError(err);
  }
}
