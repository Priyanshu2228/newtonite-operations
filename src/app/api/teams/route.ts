import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { GlobalRole } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userCtx = await authenticate(req);

    let teams;
    if (userCtx.globalRole === GlobalRole.ADMIN) {
      teams = await prisma.team.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, description: true, createdAt: true },
      });
    } else {
      const teamIds = userCtx.memberships.map((m) => m.teamId);
      teams = await prisma.team.findMany({
        where: { id: { in: teamIds } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, description: true, createdAt: true },
      });
    }

    return apiResponse({ teams });
  } catch (err) {
    return handleApiError(err);
  }
}
