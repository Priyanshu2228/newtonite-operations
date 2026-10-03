import { prisma } from '@/lib/prisma';
import { SystemRole, TeamRole } from '@prisma/client';

export interface UserContext {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  memberships: {
    teamId: string;
    teamName: string;
    role: TeamRole;
  }[];
}

export class AuthorizationService {
  static async getUserContext(userId: string): Promise<UserContext | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      memberships: user.memberships.map((m) => ({
        teamId: m.teamId,
        teamName: m.team.name,
        role: m.role,
      })),
    };
  }

  static isUserInTeam(userCtx: UserContext, teamId: string): boolean {
    if (userCtx.role === SystemRole.ADMIN) return true;
    return userCtx.memberships.some((m) => m.teamId === teamId);
  }

  static getUserRoleInTeam(userCtx: UserContext, teamId: string): TeamRole | null {
    if (userCtx.role === SystemRole.ADMIN) return TeamRole.LEAD;
    const m = userCtx.memberships.find((m) => m.teamId === teamId);
    return m ? m.role : null;
  }

  static canPerformAction(
    userCtx: UserContext,
    action: 'CREATE' | 'UPDATE' | 'TRANSITION' | 'ASSIGN' | 'COMMENT' | 'APPROVE',
    resource?: { assignedTeamId?: string | null; createdById?: string }
  ): { allowed: boolean; reason?: string } {
    if (userCtx.role === SystemRole.ADMIN) {
      return { allowed: true };
    }

    const teamId = resource?.assignedTeamId;
    const userTeamRole = teamId ? this.getUserRoleInTeam(userCtx, teamId) : null;

    // Viewers cannot mutate
    const hasOnlyViewerRoles = userCtx.memberships.every((m) => m.role === TeamRole.VIEWER);
    if (hasOnlyViewerRoles && userCtx.memberships.length > 0) {
      return { allowed: false, reason: 'Viewer role cannot perform mutating operations' };
    }

    switch (action) {
      case 'CREATE':
        return { allowed: true };

      case 'COMMENT':
        return { allowed: true };

      case 'ASSIGN':
        if (teamId && userTeamRole === TeamRole.VIEWER) {
          return { allowed: false, reason: 'Viewers cannot assign work items' };
        }
        return { allowed: true };

      case 'UPDATE':
        if (resource?.createdById === userCtx.id) return { allowed: true };
        if (teamId && (userTeamRole === TeamRole.LEAD || userTeamRole === TeamRole.MEMBER)) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'User must belong to the assigned team or be the creator to update' };

      case 'TRANSITION':
        if (resource?.createdById === userCtx.id) return { allowed: true };
        if (teamId && (userTeamRole === TeamRole.LEAD || userTeamRole === TeamRole.MEMBER)) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'User must belong to the assigned team to change state' };

      case 'APPROVE':
        if (teamId && userTeamRole === TeamRole.LEAD) {
          return { allowed: true };
        }
        return { allowed: false, reason: 'Only Team Leads or Admins can approve work items' };

      default:
        return { allowed: false, reason: 'Action unauthorized' };
    }
  }
}
