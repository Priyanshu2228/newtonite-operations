import { prisma } from '@/lib/prisma';
import { JobStatus } from '@prisma/client';

export class AsyncJobService {
  static async enqueueJob(type: string, payload: any) {
    return await prisma.asyncJob.create({
      data: {
        type,
        payload,
        status: JobStatus.PENDING,
        maxAttempts: 3,
      },
    });
  }

  static async processNextJob(targetJobId?: string): Promise<{ processed: boolean; jobId?: string; status?: JobStatus; error?: string }> {
    let pendingJob;
    if (targetJobId) {
      pendingJob = await prisma.asyncJob.findUnique({ where: { id: targetJobId } });
    } else {
      pendingJob = await prisma.asyncJob.findFirst({
        where: {
          status: JobStatus.PENDING,
          attempts: { lt: 3 },
        },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!pendingJob || pendingJob.status === JobStatus.COMPLETED || pendingJob.status === JobStatus.FAILED) {
      return { processed: false };
    }

    // Atomically transition to PROCESSING
    const claimed = await prisma.asyncJob.updateMany({
      where: {
        id: pendingJob.id,
        status: JobStatus.PENDING,
      },
      data: {
        status: JobStatus.PROCESSING,
        attempts: pendingJob.attempts + 1,
      },
    });

    if (claimed.count === 0 && !targetJobId) {
      return { processed: false };
    }

    try {
      if (pendingJob.type === 'WORK_ITEM_CREATED_NOTIFY') {
        console.log(`[Job Worker] Notification dispatched for created work item:`, pendingJob.payload);
      } else if (pendingJob.type === 'NOTIFY_REASSIGNMENT') {
        console.log(`[Job Worker] Notification sent for reassignment:`, pendingJob.payload);
      } else if (pendingJob.type === 'FAILING_TEST_JOB') {
        throw new Error('Simulated external service failure');
      }

      await prisma.asyncJob.update({
        where: { id: pendingJob.id },
        data: { status: JobStatus.COMPLETED },
      });

      return { processed: true, jobId: pendingJob.id, status: JobStatus.COMPLETED };
    } catch (err: any) {
      const isMaxAttempts = pendingJob.attempts + 1 >= pendingJob.maxAttempts;
      await prisma.asyncJob.update({
        where: { id: pendingJob.id },
        data: {
          status: isMaxAttempts ? JobStatus.FAILED : JobStatus.PENDING,
          error: err.message || 'Unknown processing error',
        },
      });

      return {
        processed: true,
        jobId: pendingJob.id,
        status: isMaxAttempts ? JobStatus.FAILED : JobStatus.PENDING,
        error: err.message,
      };
    }
  }
}
