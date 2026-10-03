import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { GlobalRole, TeamRole } from "@prisma/client";
import { getUserTeamRole } from "@/domain/work-item";
import { ForbiddenError, NotFoundError, InvalidRequestError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const { teamId } = params;

    const isAdmin = userCtx.globalRole === GlobalRole.ADMIN;
    const teamRole = getUserTeamRole(userCtx, teamId);

    if (!isAdmin && !teamRole) {
      throw new ForbiddenError("You do not have access to this team's updates");
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundError(`Team '${teamId}' not found`);
    }

    const updates = await prisma.teamUpdate.findMany({
      where: { teamId },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return apiResponse({ updates });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const userCtx = await authenticate(req);
    const { teamId } = params;

    const isAdmin = userCtx.globalRole === GlobalRole.ADMIN;
    const teamRole = getUserTeamRole(userCtx, teamId);

    // Viewers cannot post
    if (!isAdmin && (teamRole !== TeamRole.LEAD && teamRole !== TeamRole.MEMBER)) {
      throw new ForbiddenError("Only active team members and leads can post updates.");
    }

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundError(`Team '${teamId}' not found`);
    }

    const body = await req.json();
    if (!body.content || typeof body.content !== "string") {
      throw new InvalidRequestError("Update content is required");
    }
    
    const content = body.content.trim();
    if (!content) {
      throw new InvalidRequestError("Update content cannot be empty");
    }
    
    if (content.length > 500) {
      throw new InvalidRequestError("Update content is too long (max 500 characters)");
    }

    const update = await prisma.teamUpdate.create({
      data: {
        teamId,
        authorId: userCtx.id,
        content,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return apiResponse({ update });
  } catch (err) {
    return handleApiError(err);
  }
}
