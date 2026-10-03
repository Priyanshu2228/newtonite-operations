import { prisma } from "../lib/prisma";
import { NotFoundError, ForbiddenError, InvalidRequestError } from "../lib/errors";
import { canReadTeam } from "../domain/work-item";
import { UserContext } from "../auth/context";
import { Status, Priority, Category, Prisma } from "@prisma/client";
import { isOverdue } from "../domain/work-item";

export interface WorkItemListQuery {
  search?: string;
  teamId?: string;
  status?: Status;
  priority?: Priority;
  category?: Category;
  assigneeId?: string; // "me" | "unassigned" | UUID
  overdue?: boolean;
  page?: number;
  limit?: number;
  sort?: "updatedAt" | "createdAt" | "dueAt" | "priority";
  sortDir?: "asc" | "desc";
}

const PRIORITY_ORDER: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export class WorkItemQueryService {
  static async list(userCtx: UserContext, rawQuery: WorkItemListQuery) {
    // Scope to authorized teams
    let allowedTeamIds: string[] | null = null;
    if (userCtx.globalRole !== "ADMIN") {
      allowedTeamIds = userCtx.memberships.map((m) => m.teamId);
    }

    // Validate and clamp pagination
    const page = Math.max(1, rawQuery.page ?? 1);
    const limit = Math.min(100, Math.max(1, rawQuery.limit ?? 20));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.WorkItemWhereInput = {};

    // Team filter – client teamId is a narrowing filter only
    if (allowedTeamIds !== null) {
      if (rawQuery.teamId) {
        // Intersect client-supplied teamId with authorized teams
        if (!allowedTeamIds.includes(rawQuery.teamId)) {
          // Client supplied a teamId they can't access – return empty
          return {
            items: [],
            page,
            limit,
            total: 0,
            totalPages: 0,
          };
        }
        where.teamId = rawQuery.teamId;
      } else {
        where.teamId = { in: allowedTeamIds };
      }
    } else if (rawQuery.teamId) {
      where.teamId = rawQuery.teamId;
    }

    // Status filter
    if (rawQuery.status) {
      where.status = rawQuery.status;
    }

    // Priority filter
    if (rawQuery.priority) {
      where.priority = rawQuery.priority;
    }

    // Category filter
    if (rawQuery.category) {
      where.category = rawQuery.category;
    }

    // Assignee filter
    if (rawQuery.assigneeId) {
      if (rawQuery.assigneeId === "me") {
        where.assigneeId = userCtx.id;
      } else if (rawQuery.assigneeId === "unassigned") {
        where.assigneeId = null;
      } else {
        where.assigneeId = rawQuery.assigneeId;
      }
    }

    // Overdue filter
    if (rawQuery.overdue) {
      where.dueAt = { lt: new Date() };
      where.status = { notIn: [Status.RESOLVED, Status.CLOSED] };
    }

    // Full-text search (server-side ILIKE on title + description)
    if (rawQuery.search && rawQuery.search.trim() !== "") {
      const searchTerm = rawQuery.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    // Sorting – stable with id as final tiebreaker
    const sort = rawQuery.sort ?? "updatedAt";
    const sortDir = rawQuery.sortDir ?? "desc";
    let orderBy: Prisma.WorkItemOrderByWithRelationInput[] = [];

    if (sort === "priority") {
      // Use raw SQL for priority ordering (LOW < MEDIUM < HIGH < CRITICAL)
      orderBy = [{ priority: sortDir }, { id: sortDir }];
    } else if (sort === "dueAt") {
      // NULL values last for dueAt
      orderBy = [{ dueAt: { sort: sortDir, nulls: "last" } }, { id: sortDir }];
    } else {
      orderBy = [{ [sort]: sortDir }, { id: sortDir }];
    }

    const [items, total] = await Promise.all([
      prisma.workItem.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          team: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.workItem.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getById(id: string, userCtx: UserContext) {
    const item = await prisma.workItem.findUnique({
      where: { id },
      include: {
        team: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    if (!item) {
      throw new NotFoundError(`WorkItem '${id}' not found`);
    }

    if (!canReadTeam(userCtx, item.teamId)) {
      throw new ForbiddenError("You do not have access to this work item");
    }

    return item;
  }
}

export interface ActivityListQuery {
  cursor?: string;
  limit?: number;
}

export class ActivityQueryService {
  static async list(workItemId: string, userCtx: UserContext, rawQuery: ActivityListQuery) {
    // First verify the work item exists and the user can read it
    const item = await prisma.workItem.findUnique({
      where: { id: workItemId },
      select: { id: true, teamId: true },
    });

    if (!item) {
      throw new NotFoundError(`WorkItem '${workItemId}' not found`);
    }

    if (!canReadTeam(userCtx, item.teamId)) {
      throw new ForbiddenError("You do not have access to this work item");
    }

    const limit = Math.min(100, Math.max(1, rawQuery.limit ?? 30));

    // Decode cursor
    let cursorCondition: Prisma.ActivityWhereInput | undefined = undefined;
    if (rawQuery.cursor) {
      try {
        const decoded = Buffer.from(rawQuery.cursor, "base64url").toString("utf8");
        const parsed = JSON.parse(decoded);
        if (!parsed.createdAt || !parsed.id) {
          throw new Error("Invalid cursor structure");
        }
        const cursorDate = new Date(parsed.createdAt);
        const cursorId = parsed.id as string;
        // Keyset: (createdAt DESC, id DESC)
        // Next page: rows where createdAt < cursorDate OR (createdAt == cursorDate AND id < cursorId)
        cursorCondition = {
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: { equals: cursorDate }, id: { lt: cursorId } },
          ],
        };
      } catch {
        throw new InvalidRequestError("Malformed activity cursor");
      }
    }

    const where: Prisma.ActivityWhereInput = {
      workItemId,
      ...(cursorCondition ?? {}),
    };

    const activities = await prisma.activity.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1, // Fetch one extra to detect next page
      include: {
        actor: { select: { id: true, name: true, email: true } },
      },
    });

    let nextCursor: string | null = null;
    if (activities.length > limit) {
      const lastItem = activities[limit - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id }),
        "utf8"
      ).toString("base64url");
      activities.splice(limit); // Remove the extra item
    }

    return {
      items: activities,
      nextCursor,
    };
  }
}
