"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { fetchWorkItems } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  CATEGORY_LABELS,
  isOverdue,
  formatDueLabel,
  formatRelative,
} from "@/lib/display-helpers";
import type { WorkItemListParams, WorkItem } from "@/lib/api-types";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  User,
} from "lucide-react";

function buildParams(sp: URLSearchParams): WorkItemListParams {
  const params: WorkItemListParams = {};
  const search = sp.get("search");
  if (search) params.search = search;
  const teamId = sp.get("teamId");
  if (teamId) params.teamId = teamId;
  const status = sp.get("status") as any;
  if (status) params.status = status;
  const priority = sp.get("priority") as any;
  if (priority) params.priority = priority;
  const category = sp.get("category") as any;
  if (category) params.category = category;
  const assigneeId = sp.get("assigneeId");
  if (assigneeId) params.assigneeId = assigneeId;
  const overdue = sp.get("overdue");
  if (overdue === "true") params.overdue = true;
  const sort = sp.get("sort") as any;
  if (sort) params.sort = sort;
  const page = sp.get("page");
  if (page) params.page = parseInt(page);
  params.limit = 25;
  return params;
}

const STATUS_CLASS: Record<string, string> = {
  OPEN: "status-open",
  IN_PROGRESS: "status-in-progress",
  BLOCKED: "status-blocked",
  RESOLVED: "status-resolved",
  CLOSED: "status-closed",
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: "priority-critical",
  HIGH: "priority-high",
  MEDIUM: "priority-medium",
  LOW: "priority-low",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge ${STATUS_CLASS[status] ?? "status-open"}`}>
      {STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status}
    </span>
  );
}

function WorkItemRow({ item, personaId }: { item: WorkItem; personaId: string }) {
  const overdue = isOverdue(item);
  const dueLabel = item.dueAt ? formatDueLabel(item.dueAt, item.status) : null;
  const isMe = item.assigneeId === personaId;

  return (
    <tr>
      <td>
        <Link href={`/work-items/${item.id}`} className="block">
          <div className="flex items-center gap-2">
            <span
              className={`priority-dot ${PRIORITY_DOT[item.priority] ?? "priority-low"} ${
                item.priority === "CRITICAL" ? "badge-urgent" : ""
              }`}
            />
            <span className="font-medium text-foreground hover:text-blue-600 transition-colors line-clamp-1">
              {item.title}
            </span>
          </div>
          {item.nextAction && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 pl-4">
              → {item.nextAction}
            </p>
          )}
        </Link>
      </td>
      <td>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {CATEGORY_LABELS[item.category]}
        </span>
      </td>
      <td>
        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {PRIORITY_LABELS[item.priority]}
        </span>
      </td>
      <td>
        <StatusBadge status={item.status} />
      </td>
      <td>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {item.team?.name ?? "—"}
        </span>
      </td>
      <td>
        {item.assignee ? (
          <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${isMe ? "text-blue-600 font-medium" : "text-muted-foreground"}`}>
            <User className="h-3 w-3 shrink-0" />
            {isMe ? "You" : item.assignee.name}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">Unassigned</span>
        )}
      </td>
      <td>
        {dueLabel ? (
          <span className={`text-xs whitespace-nowrap ${dueLabel.urgent ? "overdue-label" : "text-muted-foreground"}`}>
            {dueLabel.label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelative(item.updatedAt)}
        </span>
      </td>
    </tr>
  );
}

export function WorkItemList() {
  const { personaId } = usePersona();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = buildParams(sp);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["work-items", personaId, Object.fromEntries(sp.entries())],
    queryFn: () => fetchWorkItems(params),
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[1] !== personaId) return undefined;
      return previousData;
    },
  });

  function setPage(page: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mb-3" />
        <p className="text-foreground font-medium">Failed to load work items</p>
        <p className="text-muted-foreground text-sm mt-1">
          {(error as any)?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-foreground font-medium">No work items found</p>
        <p className="text-muted-foreground text-sm mt-1">
          Try adjusting your filters or create a new item
        </p>
      </div>
    );
  }

  const currentPage = data.page;
  const totalPages = data.totalPages;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {data.total} item{data.total !== 1 ? "s" : ""}
        {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th className="min-w-[260px]">Title / Next Action</th>
                <th>Category</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Team</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <WorkItemRow key={item.id} item={item} personaId={personaId} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
