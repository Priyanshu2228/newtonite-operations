import { NextRequest, NextResponse } from 'next/server';
import { AuthorizationService } from '@/services/auth.service';
import { VersionMismatchError, AuthorizationError, ValidationError } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export async function getAuthenticatedUserContext(req: NextRequest) {
  const userIdHeader = req.headers.get('x-user-id');
  
  if (userIdHeader) {
    const ctx = await AuthorizationService.getUserContext(userIdHeader);
    if (ctx) return ctx;
  }

  // Fallback to default admin user for initial dev/demo convenience
  const defaultAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!defaultAdmin) {
    throw new AuthorizationError('No authenticated user found in database');
  }

  const ctx = await AuthorizationService.getUserContext(defaultAdmin.id);
  if (!ctx) throw new AuthorizationError('Failed to resolve default user context');

  return ctx;
}

export function handleApiError(error: any) {
  console.error('API Error:', error);

  if (error instanceof VersionMismatchError) {
    return NextResponse.json(
      { error: 'VERSION_MISMATCH_CONFLICT', message: error.message },
      { status: 409 }
    );
  }

  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: error.message },
      { status: 403 }
    );
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: 'INTERNAL_SERVER_ERROR', message: error.message || 'An unexpected error occurred' },
    { status: 500 }
  );
}
