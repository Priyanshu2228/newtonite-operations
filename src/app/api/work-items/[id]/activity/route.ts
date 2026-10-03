import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { ActivityQueryService } from "@/services/query.service";
import { InvalidRequestError } from "@/lib/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

const ActivityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());

    let parsed: z.infer<typeof ActivityQuerySchema>;
    try {
      parsed = ActivityQuerySchema.parse(sp);
    } catch {
      throw new InvalidRequestError("Invalid query parameters");
    }

    const result = await ActivityQueryService.list(params.id, userCtx, parsed);
    return apiResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
