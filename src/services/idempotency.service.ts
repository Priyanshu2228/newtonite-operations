import { createHash } from "crypto";
import { prisma } from "../lib/prisma";
import { Prisma } from "@prisma/client";
import {
  IdempotencyKeyReuseError,
  IdempotencyKeyRequiredError,
  InvalidRequestError,
} from "../lib/errors";

export const IDEMPOTENCY_OPERATION = {
  CREATE_WORK_ITEM: "create_work_item",
  PATCH_WORK_ITEM: "patch_work_item",
  CLAIM_WORK_ITEM: "claim_work_item",
  COMMENT_ADDED: "comment_added",
} as const;

export type IdempotencyOperation =
  (typeof IDEMPOTENCY_OPERATION)[keyof typeof IDEMPOTENCY_OPERATION];

export function validateIdempotencyKey(key: string | null | undefined): string {
  if (!key || key.trim() === "") {
    throw new IdempotencyKeyRequiredError();
  }
  if (key.length > 128) {
    throw new InvalidRequestError(
      "X-Idempotency-Key must not exceed 128 characters"
    );
  }
  return key;
}

/**
 * Compute a deterministic SHA-256 hash over the canonical mutation input.
 * The canonical input includes the resource ID (if applicable) + sorted body.
 */
export function computeRequestHash(
  input: Record<string, unknown>
): string {
  const deterministicStringify = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deterministicStringify);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      result[key] = deterministicStringify(obj[key]);
    }
    return result;
  };
  
  const canonical = JSON.stringify(deterministicStringify(input));
  return createHash("sha256").update(canonical).digest("hex");
}

export interface CompletedRecord {
  statusCode: number;
  responseBody: unknown;
  requestHash: string;
}

/**
 * Look up an existing COMPLETED IdempotencyRecord (statusCode IS NOT NULL).
 */
export async function findCompletedRecord(
  userId: string,
  operation: string,
  key: string
): Promise<CompletedRecord | null> {
  const record = await prisma.idempotencyRecord.findUnique({
    where: { userId_operation_key: { userId, operation, key } },
  });
  if (!record || record.statusCode === null) return null;
  return {
    statusCode: record.statusCode,
    responseBody: record.responseBody,
    requestHash: record.requestHash,
  };
}

/**
 * Called BEFORE authorization/state validation when a completed record is found.
 * Per SPEC Section 26:
 *   - same hash → replay stored response
 *   - different hash → 409 IDEMPOTENCY_KEY_REUSE
 */
export function checkReplay(
  existing: CompletedRecord,
  requestHash: string
): { replay: true; statusCode: number; responseBody: unknown } {
  if (existing.requestHash !== requestHash) {
    throw new IdempotencyKeyReuseError(
      "Idempotency key already used with different request body"
    );
  }
  return { replay: true, statusCode: existing.statusCode, responseBody: existing.responseBody };
}

/**
 * Execute a mutation inside a transaction that also:
 *   1. Reserves the IdempotencyRecord (INSERT with null statusCode/responseBody)
 *   2. Runs the mutationFn
 *   3. Stores the successful statusCode + responseBody
 *   4. Commits all at once
 *
 * If a unique constraint violation occurs (concurrent duplicate):
 *   - Caught OUTSIDE the aborted tx
 *   - Verify it is specifically the IdempotencyRecord constraint
 *   - Perform fresh lookup
 *   - Replay if hash matches, IDEMPOTENCY_KEY_REUSE if not
 *   - Retry full tx once if the first tx rolled back and left no record
 *
 * Errors inside the mutation throw normally, rolling back the IdempotencyRecord reservation.
 *
 * beforeCommit?: optional test-only hook that runs inside the transaction after mutation
 * but before commit – used by rollback test (SPEC §58)
 */
export async function withIdempotency<T>(
  userId: string,
  operation: string,
  key: string,
  requestHash: string,
  mutationFn: (tx: Prisma.TransactionClient) => Promise<{ statusCode: number; responseBody: T }>,
  beforeCommit?: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<{ statusCode: number; responseBody: T; replayed: boolean }> {
  return await executeIdempotentMutation(
    userId,
    operation,
    key,
    requestHash,
    mutationFn,
    beforeCommit,
    false
  );
}

async function executeIdempotentMutation<T>(
  userId: string,
  operation: string,
  key: string,
  requestHash: string,
  mutationFn: (tx: Prisma.TransactionClient) => Promise<{ statusCode: number; responseBody: T }>,
  beforeCommit: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined,
  isRetry: boolean
): Promise<{ statusCode: number; responseBody: T; replayed: boolean }> {
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Reserve IdempotencyRecord with null status/response (inside transaction)
        await tx.idempotencyRecord.create({
          data: {
            userId,
            operation,
            key,
            requestHash,
            statusCode: null,
            responseBody: Prisma.JsonNull,
          },
        });

        // 2. Execute the business mutation
        const { statusCode, responseBody } = await mutationFn(tx);

        // 3. Run test-only beforeCommit hook if provided
        if (beforeCommit) {
          await beforeCommit(tx);
        }

        // 4. Store successful 2xx result in the same transaction
        await tx.idempotencyRecord.update({
          where: { userId_operation_key: { userId, operation, key } },
          data: {
            statusCode,
            responseBody: responseBody as any,
          },
        });

        return { statusCode, responseBody };
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );

    return { ...result, replayed: false };
  } catch (err: any) {
    // Check if it's a Prisma unique constraint violation on IdempotencyRecord
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const meta = err.meta as { target?: string[] } | undefined;
      const isIdempotencyConstraint =
        meta?.target?.some((f) =>
          ["userId", "operation", "key"].includes(f)
        ) ?? false;

      if (!isIdempotencyConstraint) {
        // Unrelated unique constraint – re-throw
        throw err;
      }

      // Catch OUTSIDE the aborted transaction: perform fresh lookup
      const existing = await findCompletedRecord(userId, operation, key);

      if (existing) {
        // First request committed successfully – replay or key-reuse
        const replay = checkReplay(existing, requestHash);
        return {
          statusCode: replay.statusCode,
          responseBody: replay.responseBody as T,
          replayed: true,
        };
      }

      // First request rolled back – retry once
      if (!isRetry) {
        return await executeIdempotentMutation(
          userId,
          operation,
          key,
          requestHash,
          mutationFn,
          beforeCommit,
          true
        );
      }

      // Second retry also failed with constraint – this should not normally happen
      throw err;
    }

    // Non-idempotency errors: the transaction is already rolled back,
    // so the IdempotencyRecord reservation is also rolled back → key remains retryable
    throw err;
  }
}
