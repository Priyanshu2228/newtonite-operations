import { z } from "zod";
import { Category, Priority, Status } from "@prisma/client";
import { InvalidRequestError } from "../lib/errors";

export const CreateWorkItemSchema = z
  .object({
    title: z.string({ required_error: "title is required" }).min(1, "title cannot be empty"),
    description: z
      .string({ required_error: "description is required" })
      .min(1, "description cannot be empty"),
    category: z.nativeEnum(Category, { required_error: "valid category is required" }),
    teamId: z.string({ required_error: "teamId is required" }).uuid("teamId must be a valid UUID"),
    priority: z.nativeEnum(Priority).optional(),
    nextAction: z.string().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional().or(z.date().nullable().optional()),
  })
  .strict();

export const AllowedPatchKeys = [
  "version",
  "title",
  "description",
  "priority",
  "status",
  "assigneeId",
  "nextAction",
  "dueAt",
];

export const PatchWorkItemSchema = z
  .object({
    version: z
      .number({ required_error: "version is required" })
      .int()
      .min(1, "version must be a positive integer"),
    title: z.string().min(1, "title cannot be empty").optional(),
    description: z.string().min(1, "description cannot be empty").optional(),
    category: z.nativeEnum(Category).optional(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.nativeEnum(Status).optional(),
    assigneeId: z.string().uuid("assigneeId must be a valid UUID").nullable().optional(),
    nextAction: z.string().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional().or(z.date().nullable().optional()),
  });

export function parseCreatePayload(body: unknown) {
  try {
    return CreateWorkItemSchema.parse(body);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new InvalidRequestError(`Validation error: ${msg}`);
    }
    throw new InvalidRequestError("Invalid request body");
  }
}

export function parsePatchPayload(body: unknown) {
  if (typeof body !== "object" || body === null) {
    throw new InvalidRequestError("Request body must be a JSON object");
  }

  // Section 84: Reject unknown or protected fields with 400 INVALID_REQUEST
  for (const k of Object.keys(body)) {
    if (!AllowedPatchKeys.includes(k)) {
      throw new InvalidRequestError(`Field '${k}' is protected or unknown in PATCH body`);
    }
  }

  try {
    return PatchWorkItemSchema.parse(body);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new InvalidRequestError(`Validation error: ${msg}`);
    }
    throw new InvalidRequestError("Invalid request body");
  }
}
