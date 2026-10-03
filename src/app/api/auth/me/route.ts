import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserContext } from '@/lib/api-helper';

export async function GET(req: NextRequest) {
  try {
    const userCtx = await getAuthenticatedUserContext(req);
    return NextResponse.json({ user: userCtx });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
