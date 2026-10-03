import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ForbiddenError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userCtx = await authenticate(req);
    if (userCtx.globalRole !== "ADMIN") {
      throw new ForbiddenError("Only admins can list users");
    }

    const users = await prisma.user.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: {
          include: {
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    return apiResponse({ users });
  } catch (err) {
    return handleApiError(err);
  }
}
