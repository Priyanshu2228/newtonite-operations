"use client";

// Client-side API helpers: always sends X-User-Id from the active persona
// and cache: "no-store" per SPEC §42

import type {
  WorkItem,
  PaginatedWorkItems,
  PaginatedActivity,
  Team,
  TeamMember,
  User,
  WorkItemListParams,
  CreateWorkItemInput,
  PatchWorkItemInput,
  DashboardStats,
} from "./api-types";

function getActivePersonaId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("newtonite:personaId") ?? "00000000-0000-4000-a000-000000000001";
}

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const { idempotencyKey, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Id": getActivePersonaId(),
    ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(path, {
    ...fetchOptions,
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ code: "UNKNOWN", message: "Request failed" }));
    const err = new Error(body.message ?? "Request failed") as any;
    err.code = body.code;
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

function toSearchParams(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export async function fetchDashboard(): Promise<DashboardStats> {
  return apiFetch("/api/dashboard");
}

// ── Teams ──────────────────────────────────────────────────────────────────
export async function fetchTeams(): Promise<{ teams: Team[] }> {
  return apiFetch("/api/teams");
}

export async function fetchTeamMembers(teamId: string): Promise<{ members: TeamMember[] }> {
  return apiFetch(`/api/teams/${teamId}/members`);
}

// ── Work Items ─────────────────────────────────────────────────────────────
export async function fetchWorkItems(params: WorkItemListParams = {}): Promise<PaginatedWorkItems> {
  return apiFetch(`/api/work-items${toSearchParams(params as Record<string, unknown>)}`);
}

export async function fetchWorkItem(id: string): Promise<WorkItem> {
  return apiFetch(`/api/work-items/${id}`);
}

export async function createWorkItem(input: CreateWorkItemInput): Promise<WorkItem> {
  return apiFetch("/api/work-items", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function patchWorkItem(id: string, input: PatchWorkItemInput): Promise<WorkItem> {
  return apiFetch(`/api/work-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function claimWorkItem(id: string, version: number): Promise<WorkItem> {
  return apiFetch(`/api/work-items/${id}/claim`, {
    method: "POST",
    body: JSON.stringify({ version }),
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function addComment(workItemId: string, message: string): Promise<void> {
  return apiFetch(`/api/work-items/${workItemId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ── Activity ───────────────────────────────────────────────────────────────
export async function fetchActivity(
  workItemId: string,
  cursor?: string | null
): Promise<PaginatedActivity> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=20` : `?limit=20`;
  return apiFetch(`/api/work-items/${workItemId}/activity${qs}`);
}

// ── Users (Admin) ──────────────────────────────────────────────────────────
export async function fetchUsers(): Promise<{ users: User[] }> {
  return apiFetch("/api/users");
}

export async function patchUserRole(
  userId: string,
  payload: {
    globalRole?: "ADMIN" | "USER";
    memberships?: Array<{ teamId: string; teamRole: "LEAD" | "MEMBER" | "VIEWER" }>;
  }
): Promise<User> {
  return apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function removeTeamMembership(userId: string, teamId: string): Promise<void> {
  return apiFetch(`/api/users/${userId}?teamId=${teamId}`, {
    method: "DELETE",
  });
}
