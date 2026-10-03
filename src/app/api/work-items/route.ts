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
import { z } from "zod";
import { Status, Priority, Category } from "@prisma/client";
import { InvalidRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ListQuerySchema = z.object({
  search: z.string().optional(),
  teamId: z.string().uuid().optional(),
  status: z.nativeEnum(Status).optional(),
  priority: z.nativeEnum(Priority).optional(),
  category: z.nativeEnum(Category).optional(),
  assigneeId: z.string().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["updatedAt", "createdAt", "dueAt", "priority"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userCtx = await authenticate(req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());

    let parsed: z.infer<typeof ListQuerySchema>;
    try {
      parsed = ListQuerySchema.parse(sp);
    } catch (e: any) {
      throw new InvalidRequestError("Invalid query parameters");
    }

    const result = await WorkItemQueryService.list(userCtx, {
      ...parsed,
      overdue: parsed.overdue === "true",
    });

    return apiResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
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
      operation: IDEMPOTENCY_OPERATION.CREATE_WORK_ITEM,
      userId: userCtx.id,
      body,
    });

    // Step 6-8: Check for existing completed record BEFORE auth/state validation
    const existing = await findCompletedRecord(
      userCtx.id,
      IDEMPOTENCY_OPERATION.CREATE_WORK_ITEM,
      key
    );
    if (existing) {
      const replay = checkReplay(existing, requestHash);
      return apiResponse(replay.responseBody, replay.statusCode, {
        "Idempotent-Replayed": "true",
      });
    }

    // Steps 9-11: No existing record – proceed with authorization + mutation
    const { statusCode, responseBody, replayed } = await withIdempotency(
      userCtx.id,
      IDEMPOTENCY_OPERATION.CREATE_WORK_ITEM,
      key,
      requestHash,
      async (tx) => {
        const item = await WorkItemService.createWorkItem(userCtx, body, tx);
        return { statusCode: 201, responseBody: item };
      }
    );

    return apiResponse(responseBody, statusCode, replayed ? { "Idempotent-Replayed": "true" } : undefined);
  } catch (err) {
    return handleApiError(err);
  }
}
