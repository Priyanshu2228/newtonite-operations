import { NextRequest, NextResponse } from 'next/server';
import { WorkItemService } from '@/services/workitem.service';
import { getAuthenticatedUserContext, handleApiError } from '@/lib/api-helper';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userCtx = await getAuthenticatedUserContext(req);
    const body = await req.json();
    const comment = await WorkItemService.addComment(params.id, userCtx, body.content);

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
