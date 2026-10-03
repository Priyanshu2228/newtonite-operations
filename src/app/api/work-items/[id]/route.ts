import { NextRequest, NextResponse } from 'next/server';
import { WorkItemService } from '@/services/workitem.service';
import { IdempotencyService } from '@/services/idempotency.service';
import { getAuthenticatedUserContext, handleApiError } from '@/lib/api-helper';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const item = await WorkItemService.getWorkItemById(params.id);
    if (!item) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Work item not found' }, { status: 404 });
    }
    return NextResponse.json({ data: item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
    const updated = await WorkItemService.updateWorkItem(params.id, userCtx, body);

    const responsePayload = { success: true, data: updated };

    if (idempotencyKey) {
      await IdempotencyService.saveKey(idempotencyKey, req.nextUrl.pathname, 200, responsePayload);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    return handleApiError(error);
  }
}
