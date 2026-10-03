import { prisma } from "../lib/prisma";
import { NotFoundError, ForbiddenError, InvalidRequestError } from "../lib/errors";
import { canReadTeam } from "../domain/work-item";
import { UserContext } from "../auth/context";
import { Status, Priority, Category, Prisma } from "@prisma/client";

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
  sort?: "attention" | "updatedAt" | "createdAt" | "dueAt" | "priority";
  sortDir?: "asc" | "desc";
}

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

    // ── Attention sort uses fully parameterized raw SQL ────────────────────
    const sort = rawQuery.sort ?? "updatedAt";
    const sortDir = rawQuery.sortDir ?? "desc";

    if (sort === "attention") {
      return WorkItemQueryService._listWithAttentionSort(
        userCtx,
        rawQuery,
        allowedTeamIds,
        page,
        limit,
        skip
      );
    }

    // ── All other sorts: Prisma native ─────────────────────────────────────
    const where: Prisma.WorkItemWhereInput = {};

    // Team filter
    if (allowedTeamIds !== null) {
      if (rawQuery.teamId) {
        if (!allowedTeamIds.includes(rawQuery.teamId)) {
          return { items: [], page, limit, total: 0, totalPages: 0 };
        }
        where.teamId = rawQuery.teamId;
      } else {
        where.teamId = { in: allowedTeamIds };
      }
    } else if (rawQuery.teamId) {
      where.teamId = rawQuery.teamId;
    }

    if (rawQuery.status) where.status = rawQuery.status;
    if (rawQuery.priority) where.priority = rawQuery.priority;
    if (rawQuery.category) where.category = rawQuery.category;

    if (rawQuery.assigneeId) {
      if (rawQuery.assigneeId === "me") {
        where.assigneeId = userCtx.id;
      } else if (rawQuery.assigneeId === "unassigned") {
        where.assigneeId = null;
      } else {
        where.assigneeId = rawQuery.assigneeId;
      }
    }

    if (rawQuery.overdue) {
      where.dueAt = { lt: new Date() };
      where.status = { notIn: [Status.RESOLVED, Status.CLOSED] };
    }

    if (rawQuery.search?.trim()) {
      const s = rawQuery.search.trim();
      where.OR = [
        { title: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
      ];
    }

    let orderBy: Prisma.WorkItemOrderByWithRelationInput[] = [];
    if (sort === "priority") {
      orderBy = [{ priority: sortDir }, { id: sortDir }];
    } else if (sort === "dueAt") {
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

    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Attention sort: single fully-parameterized SQL query.
   * Ordering: BLOCKED > IN_PROGRESS > OPEN > RESOLVED > CLOSED
   * Within active statuses: overdue first, then due ASC nulls last, then CRITICAL > HIGH > MEDIUM > LOW.
   * No intermediate ID fetch. Scales to large datasets.
   */
  private static async _listWithAttentionSort(
    userCtx: UserContext,
    rawQuery: WorkItemListQuery,
    allowedTeamIds: string[] | null,
    page: number,
    limit: number,
    skip: number
  ) {
    // Build parameterized SQL fragments for the WHERE clause
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];

    // Team authorization
    if (allowedTeamIds !== null) {
      if (rawQuery.teamId) {
        if (!allowedTeamIds.includes(rawQuery.teamId)) {
          return { items: [], page, limit, total: 0, totalPages: 0 };
        }
        conditions.push(Prisma.sql`wi."teamId" = ${rawQuery.teamId}`);
      } else if (allowedTeamIds.length === 0) {
        return { items: [], page, limit, total: 0, totalPages: 0 };
      } else {
        conditions.push(Prisma.sql`wi."teamId" = ANY(${allowedTeamIds})`);
      }
    } else if (rawQuery.teamId) {
      conditions.push(Prisma.sql`wi."teamId" = ${rawQuery.teamId}`);
    }

    // Status filter
    if (rawQuery.status) {
      conditions.push(Prisma.sql`wi.status::text = ${rawQuery.status}`);
    }

    // Priority filter
    if (rawQuery.priority) {
      conditions.push(Prisma.sql`wi.priority::text = ${rawQuery.priority}`);
    }

    // Category filter
    if (rawQuery.category) {
      conditions.push(Prisma.sql`wi.category::text = ${rawQuery.category}`);
    }

    // Assignee filter
    if (rawQuery.assigneeId) {
      if (rawQuery.assigneeId === "me") {
        conditions.push(Prisma.sql`wi."assigneeId" = ${userCtx.id}`);
      } else if (rawQuery.assigneeId === "unassigned") {
        conditions.push(Prisma.sql`wi."assigneeId" IS NULL`);
      } else {
        conditions.push(Prisma.sql`wi."assigneeId" = ${rawQuery.assigneeId}`);
      }
    }

    // Overdue filter
    if (rawQuery.overdue) {
      conditions.push(Prisma.sql`wi."dueAt" < NOW()`);
      conditions.push(Prisma.sql`wi.status::text NOT IN ('RESOLVED', 'CLOSED')`);
    }

    // Full-text search
    if (rawQuery.search?.trim()) {
      const s = `%${rawQuery.search.trim()}%`;
      conditions.push(
        Prisma.sql`(wi.title ILIKE ${s} OR wi.description ILIKE ${s})`
      );
    }

    const whereClause = Prisma.join(conditions, " AND ");

    const [rows, countResult] = await Promise.all([
      prisma.$queryRaw<any[]>(
        Prisma.sql`
          SELECT
            wi.id, wi.title, wi.description,
            wi.status, wi.priority, wi.category,
            wi."teamId", wi."createdById", wi."assigneeId",
            wi."nextAction", wi."dueAt", wi.version,
            wi."createdAt", wi."updatedAt",
            CASE WHEN t.id IS NOT NULL
                 THEN json_build_object('id', t.id, 'name', t.name)
                 ELSE NULL END AS team,
            json_build_object('id', cb.id, 'name', cb.name, 'email', cb.email) AS "createdBy",
            CASE WHEN a.id IS NOT NULL
                 THEN json_build_object('id', a.id, 'name', a.name, 'email', a.email)
                 ELSE NULL END AS assignee
          FROM "WorkItem" wi
          LEFT JOIN "Team" t ON t.id = wi."teamId"
          LEFT JOIN "User" cb ON cb.id = wi."createdById"
          LEFT JOIN "User" a ON a.id = wi."assigneeId"
          WHERE ${whereClause}
          ORDER BY
            CASE wi.status::text
              WHEN 'BLOCKED'     THEN 1
              WHEN 'IN_PROGRESS' THEN 2
              WHEN 'OPEN'        THEN 3
              WHEN 'RESOLVED'    THEN 4
              WHEN 'CLOSED'      THEN 5
              ELSE 6
            END ASC,
            CASE
              WHEN wi."dueAt" IS NOT NULL
               AND wi."dueAt" < NOW()
               AND wi.status::text NOT IN ('RESOLVED','CLOSED')
              THEN 0 ELSE 1
            END ASC,
            wi."dueAt" ASC NULLS LAST,
            CASE wi.priority::text
              WHEN 'CRITICAL' THEN 1
              WHEN 'HIGH'     THEN 2
              WHEN 'MEDIUM'   THEN 3
              WHEN 'LOW'      THEN 4
              ELSE 5
            END ASC,
            wi.id ASC
          LIMIT ${limit} OFFSET ${skip}
        `
      ),
      prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`
          SELECT COUNT(*) AS count
          FROM "WorkItem" wi
          WHERE ${whereClause}
        `
      ),
    ]);

    const total = Number(countResult[0].count);
    return { items: rows, page, limit, total, totalPages: Math.ceil(total / limit) };
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
      take: limit + 1,
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
      activities.splice(limit);
    }

    return { items: activities, nextCursor };
  }
}
