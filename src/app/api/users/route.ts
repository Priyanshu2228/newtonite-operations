import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, InvalidRequestError } from "@/lib/errors";

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

export async function POST(req: NextRequest) {
  try {
    const userCtx = await authenticate(req);
    if (userCtx.globalRole !== "ADMIN") {
      throw new ForbiddenError("Only admins can create users");
    }

    const body = await req.json();
    const { name, email, globalRole, teamId, teamRole } = body;

    if (!name || !email || !globalRole) {
      throw new InvalidRequestError("Missing required fields (name, email, globalRole)");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new InvalidRequestError("User with this email already exists");
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        globalRole,
        memberships: teamId ? {
          create: [{
            teamId,
            teamRole: teamRole || "MEMBER"
          }]
        } : undefined
      },
      include: {
        memberships: {
          include: {
            team: { select: { id: true, name: true } },
          },
        },
      }
    });

    return apiResponse(newUser, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

