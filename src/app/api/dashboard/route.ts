import { NextRequest } from "next/server";
import { authenticate, handleApiError, apiResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Status } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userCtx = await authenticate(req);
    const now = new Date();

    // Build team filter based on user's memberships (admin sees all)
    const isAdmin = userCtx.globalRole === "ADMIN";
    const teamIds = userCtx.memberships.map((m) => m.teamId);

    const teamFilter = isAdmin ? {} : { teamId: { in: teamIds } };

    // Fetch all active (non-closed) items for the user's scope
    const [
      totalActive,
      unassigned,
      overdue,
      blocked,
      myActive,
      myDueToday,
      myOverdue,
      myBlocked,
      teamBreakdown,
      recentActivity,
    ] = await Promise.all([
      // Org stats (admin) or team stats
      prisma.workItem.count({
        where: { ...teamFilter, status: { notIn: [Status.CLOSED] } },
      }),
      prisma.workItem.count({
        where: {
          ...teamFilter,
          status: { notIn: [Status.CLOSED, Status.RESOLVED] },
          assigneeId: null,
        },
      }),
      prisma.workItem.count({
        where: {
          ...teamFilter,
          status: { notIn: [Status.CLOSED, Status.RESOLVED] },
          dueAt: { lt: now },
        },
      }),
      prisma.workItem.count({
        where: { ...teamFilter, status: Status.BLOCKED },
      }),

      // My work stats
      prisma.workItem.count({
        where: {
          assigneeId: userCtx.id,
          status: { notIn: [Status.CLOSED, Status.RESOLVED] },
        },
      }),
      prisma.workItem.count({
        where: {
          assigneeId: userCtx.id,
          status: { notIn: [Status.CLOSED, Status.RESOLVED] },
          dueAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          },
        },
      }),
      prisma.workItem.count({
        where: {
          assigneeId: userCtx.id,
          status: { notIn: [Status.CLOSED, Status.RESOLVED] },
          dueAt: { lt: now },
        },
      }),
      prisma.workItem.count({
        where: { assigneeId: userCtx.id, status: Status.BLOCKED },
      }),

      // Breakdowns per team
      prisma.workItem.groupBy({
        by: ["teamId", "status"],
        where: {
          ...teamFilter,
          status: { notIn: [Status.CLOSED] },
        },
        _count: true,
      }),

      // Recent activity (last 10)
      prisma.activity.findMany({
        where: isAdmin
          ? {}
          : {
              workItem: { teamId: { in: teamIds } },
            },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          actor: { select: { id: true, name: true } },
          workItem: { select: { id: true, title: true } },
        },
      }),
    ]);

    // Fetch team names for breakdown
    const uniqueTeamIds = [...new Set(teamBreakdown.map((r) => r.teamId))];
    const teams = await prisma.team.findMany({
      where: { id: { in: uniqueTeamIds } },
      select: { id: true, name: true },
    });
    const teamNameMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

    const teamStats = uniqueTeamIds.map((tid) => {
      const rows = teamBreakdown.filter((r) => r.teamId === tid);
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, r._count]));
      return {
        teamId: tid,
        teamName: teamNameMap[tid] ?? tid,
        total: rows.reduce((s, r) => s + r._count, 0),
        byStatus,
      };
    });

    return apiResponse({
      org: { totalActive, unassigned, overdue, blocked },
      my: { active: myActive, dueToday: myDueToday, overdue: myOverdue, blocked: myBlocked },
      teamStats,
      recentActivity,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
