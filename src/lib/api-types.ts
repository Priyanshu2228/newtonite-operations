// Types mirroring the backend API contracts

export type GlobalRole = "ADMIN" | "USER";
export type TeamRole = "LEAD" | "MEMBER" | "VIEWER";
export type Category = "INCIDENT" | "COMPLIANCE" | "PAYMENT_INVESTIGATION" | "APPROVAL" | "OPERATIONAL_TASK";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Status = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "RESOLVED" | "CLOSED";
export type ActivityAction =
  | "CREATED"
  | "UPDATED"
  | "STATUS_CHANGED"
  | "ASSIGNED"
  | "UNASSIGNED"
  | "PRIORITY_CHANGED";

export interface Team {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  teamRole: TeamRole;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  teamId: string;
  team?: { id: string; name: string };
  createdById: string;
  createdBy?: { id: string; name: string; email: string };
  assigneeId: string | null;
  assignee?: { id: string; name: string; email: string } | null;
  nextAction?: string | null;
  dueAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  workItemId: string;
  actorId: string;
  actor?: { id: string; name: string; email: string };
  action: ActivityAction;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedWorkItems {
  items: WorkItem[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface PaginatedActivity {
  items: Activity[];
  nextCursor: string | null;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface WorkItemListParams {
  search?: string;
  teamId?: string;
  status?: Status;
  priority?: Priority;
  category?: Category;
  assigneeId?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
  sort?: "updatedAt" | "createdAt" | "dueAt" | "priority";
  sortDir?: "asc" | "desc";
}

export interface CreateWorkItemInput {
  title: string;
  description: string;
  category: Category;
  teamId: string;
  priority?: Priority;
  nextAction?: string;
  dueAt?: string;
}

export interface PatchWorkItemInput {
  version: number;
  title?: string;
  description?: string;
  priority?: Priority;
  status?: Status;
  assigneeId?: string | null;
  nextAction?: string | null;
  dueAt?: string | null;
}
