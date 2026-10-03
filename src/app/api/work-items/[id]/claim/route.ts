import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse, getIdempotencyKey } from "@/lib/api";
import { WorkItemService } from "@/services/work-item.service";
import {
  computeRequestHash,
  findCompletedRecord,
  checkReplay,
  withIdempotency,
  IDEMPOTENCY_OPERATION,
} from "@/services/idempotency.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const key = getIdempotencyKey(req);

    const requestHash = computeRequestHash({
      operation: IDEMPOTENCY_OPERATION.CLAIM_WORK_ITEM,
      resourceId: params.id,
      userId: userCtx.id,
    });

    // Check for existing completed record BEFORE auth/state validation (SPEC §26)
    const existing = await findCompletedRecord(
      userCtx.id,
      IDEMPOTENCY_OPERATION.CLAIM_WORK_ITEM,
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
      IDEMPOTENCY_OPERATION.CLAIM_WORK_ITEM,
      key,
      requestHash,
      async (tx) => {
        const item = await WorkItemService.claimWorkItem(params.id, userCtx, tx);
        return { statusCode: 200, responseBody: item };
      }
    );

    return apiResponse(responseBody, statusCode, replayed ? { "Idempotent-Replayed": "true" } : undefined);
  } catch (err) {
    return handleApiError(err);
  }
}
