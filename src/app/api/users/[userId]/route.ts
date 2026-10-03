import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError, InvalidRequestError } from "@/lib/errors";
import { GlobalRole, TeamRole } from "@prisma/client";
import { z } from "zod";

export const dynamic = "force-dynamic";

const RoleSchema = z.object({
  globalRole: z.nativeEnum(GlobalRole).optional(),
  memberships: z
    .array(
      z.object({
        teamId: z.string().uuid(),
        teamRole: z.nativeEnum(TeamRole),
      })
    )
    .optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userCtx = await authenticate(req);
    if (userCtx.globalRole !== "ADMIN") {
      throw new ForbiddenError("Only admins can modify user roles");
    }

    const target = await prisma.user.findUnique({
      where: { id: params.userId },
    });
    if (!target) throw new NotFoundError(`User '${params.userId}' not found`);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new InvalidRequestError("Request body must be valid JSON");
    }

    const parsed = RoleSchema.safeParse(body);
    if (!parsed.success)
      throw new InvalidRequestError("Invalid role payload");

    const { globalRole, memberships } = parsed.data;

    await prisma.$transaction(async (tx) => {
      if (globalRole !== undefined && globalRole !== target.globalRole) {
        if (target.globalRole === "ADMIN" && globalRole === "USER") {
          const adminCount = await tx.user.count({
            where: { globalRole: "ADMIN" },
          });
          if (adminCount <= 1) {
            throw new InvalidRequestError("Cannot demote the last GLOBAL ADMIN");
          }
        }
        await tx.user.update({
          where: { id: params.userId },
          data: { globalRole },
        });
      }
      if (memberships !== undefined) {
        // Upsert team memberships
        for (const m of memberships) {
          await tx.teamMember.upsert({
            where: {
              userId_teamId: { userId: params.userId, teamId: m.teamId },
            },
            update: { teamRole: m.teamRole },
            create: {
              userId: params.userId,
              teamId: m.teamId,
              teamRole: m.teamRole,
            },
          });
        }
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        memberships: {
          include: { team: { select: { id: true, name: true } } },
        },
      },
    });

    return apiResponse(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const userCtx = await authenticate(req);
    if (userCtx.globalRole !== "ADMIN") {
      throw new ForbiddenError("Only admins can remove team memberships");
    }

    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get("teamId");
    if (!teamId) throw new InvalidRequestError("teamId query param is required");

    await prisma.teamMember.deleteMany({
      where: { userId: params.userId, teamId },
    });

    return apiResponse({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
