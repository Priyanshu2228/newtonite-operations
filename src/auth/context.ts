import { prisma } from "../lib/prisma";
import { GlobalRole, TeamRole } from "@prisma/client";
import { UnauthenticatedError } from "../lib/errors";

export interface UserContext {
  id: string;
  name: string;
  email: string;
  globalRole: GlobalRole;
  memberships: Array<{
    teamId: string;
    teamRole: TeamRole;
  }>;
}

export async function getUserContext(userId?: string | null): Promise<UserContext> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new UnauthenticatedError("Missing X-User-Id header");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        select: {
          teamId: true,
          teamRole: true,
        },
      },
    },
  });

  if (!user) {
    throw new UnauthenticatedError("Invalid authenticated user ID");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    globalRole: user.globalRole,
    memberships: user.memberships,
  };
}
