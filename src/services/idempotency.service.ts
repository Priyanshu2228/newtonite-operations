import { prisma } from '@/lib/prisma';

export class IdempotencyService {
  static async checkKey(key: string, requestPath: string) {
    if (!key) return null;
    const record = await prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (record && record.requestPath === requestPath) {
      return {
        statusCode: record.statusCode,
        body: record.responseBody,
      };
    }

    return null;
  }

  static async saveKey(key: string, requestPath: string, statusCode: number, responseBody: any) {
    if (!key) return;
    try {
      await prisma.idempotencyKey.create({
        data: {
          key,
          requestPath,
          statusCode,
          responseBody,
        },
      });
    } catch (error) {
      // Key might already exist if concurrent duplicate requests raced
      console.warn('Idempotency key save collision ignored:', key);
    }
  }
}
