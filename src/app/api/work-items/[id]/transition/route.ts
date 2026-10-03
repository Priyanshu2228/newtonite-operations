import { NextRequest, NextResponse } from 'next/server';
import { WorkItemService } from '@/services/workitem.service';
import { IdempotencyService } from '@/services/idempotency.service';
import { getAuthenticatedUserContext, handleApiError } from '@/lib/api-helper';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    const updated = await WorkItemService.transitionStatus(params.id, userCtx, body);

    const responsePayload = { success: true, data: updated };

    if (idempotencyKey) {
      await IdempotencyService.saveKey(idempotencyKey, req.nextUrl.pathname, 200, responsePayload);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    return handleApiError(error);
  }
}
