import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { WorkItemService } from '@/services/workitem.service';
import { IdempotencyService } from '@/services/idempotency.service';
import { getAuthenticatedUserContext, handleApiError } from '@/lib/api-helper';
import { Status, Priority, WorkItemType } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as Status | null;
    const priority = searchParams.get('priority') as Priority | null;
    const type = searchParams.get('type') as WorkItemType | null;
    const teamId = searchParams.get('teamId');
    const assigneeId = searchParams.get('assigneeId');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (teamId) where.assignedTeamId = teamId;
    if (assigneeId) where.assignedToId = assigneeId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.workItem.count({ where }),
      prisma.workItem.findMany({
        where,
        include: {
          assignedTeam: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userCtx = await getAuthenticatedUserContext(req);
    const idempotencyKey = req.headers.get('x-idempotency-key');

    if (idempotencyKey) {
      const cached = await IdempotencyService.checkKey(idempotencyKey, req.nextUrl.pathname);
      if (cached) {
        return NextResponse.json(cached.body, { status: cached.statusCode });
      }
    }

    const body = await req.json();
    const item = await WorkItemService.createWorkItem(userCtx, body);

    const responsePayload = { success: true, data: item };

    if (idempotencyKey) {
      await IdempotencyService.saveKey(idempotencyKey, req.nextUrl.pathname, 201, responsePayload);
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
