import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { GlobalRole, TeamRole } from "@prisma/client";
import { getUserTeamRole } from "@/domain/work-item";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const { teamId } = params;

    // Only ADMIN or LEAD of this specific team may access the member list
    const isAdmin = userCtx.globalRole === GlobalRole.ADMIN;
    const teamRole = getUserTeamRole(userCtx, teamId);
    const isTeamLead = teamRole === TeamRole.LEAD;

    if (!isAdmin && !isTeamLead) {
      throw new ForbiddenError(
        "Only Admins and Team Leads may list assignable members"
      );
    }

    // Verify the team exists
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundError(`Team '${teamId}' not found`);
    }

    // Return only LEAD or MEMBER (not VIEWER)
    const members = await prisma.teamMember.findMany({
      where: {
        teamId,
        teamRole: { in: [TeamRole.LEAD, TeamRole.MEMBER] },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    return apiResponse({
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        teamRole: m.teamRole,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
