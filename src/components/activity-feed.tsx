"use client";

import React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchActivity } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Activity } from "@/lib/api-types";
import { formatRelative, formatDateTime } from "@/lib/display-helpers";
import {
  PlusCircle,
  Edit3,
  ArrowRightCircle,
  UserCheck,
  UserMinus,
  AlertCircle,
  BarChart2,
  Loader2,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: PlusCircle,
  UPDATED: Edit3,
  STATUS_CHANGED: ArrowRightCircle,
  ASSIGNED: UserCheck,
  UNASSIGNED: UserMinus,
  PRIORITY_CHANGED: BarChart2,
};

const ACTION_COLORS: Record<string, string> = {
  CREATED: "text-emerald-400",
  UPDATED: "text-blue-400",
  STATUS_CHANGED: "text-violet-400",
  ASSIGNED: "text-teal-400",
  UNASSIGNED: "text-orange-400",
  PRIORITY_CHANGED: "text-amber-400",
};

function describeActivity(activity: Activity): string {
  const d = activity.details as Record<string, unknown> | null;
  switch (activity.action) {
    case "CREATED":
      return "Created this work item";
    case "STATUS_CHANGED":
      return `Changed status from ${d?.from ?? "?"} to ${d?.to ?? "?"}`;
    case "PRIORITY_CHANGED":
      return `Changed priority from ${d?.from ?? "?"} to ${d?.to ?? "?"}`;
    case "ASSIGNED":
      return d?.via === "claim"
        ? "Claimed this item"
        : `Assigned to ${d?.assigneeName ?? "someone"}`;
    case "UNASSIGNED":
      return "Removed assignee";
    case "UPDATED": {
      const fields = d?.fields as string[] | undefined;
      return fields?.length
        ? `Updated: ${fields.join(", ")}`
        : "Updated this item";
    }
    default:
      return String(activity.action);
  }
}

export function ActivityFeed({ workItemId }: { workItemId: string }) {
  const { personaId } = usePersona();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ["activity", personaId, workItemId],
      queryFn: ({ pageParam }) => fetchActivity(workItemId, pageParam as string | null),
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-400 py-6">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load activity</span>
      </div>
    );
  }

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  if (allItems.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-4 text-center">No activity yet</p>
    );
  }

  return (
    <div className="space-y-1">
      {allItems.map((activity) => {
        const Icon = ACTION_ICONS[activity.action] ?? Edit3;
        const color = ACTION_COLORS[activity.action] ?? "text-slate-400";
        return (
          <div key={activity.id} className="flex items-start gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
            <div className={`mt-0.5 flex-shrink-0 ${color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200">{describeActivity(activity)}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{activity.actor?.name ?? "Unknown"}</span>
                <span className="text-xs text-slate-600">·</span>
                <span className="text-xs text-slate-500" title={formatDateTime(activity.createdAt)}>
                  {formatRelative(activity.createdAt)}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {hasNextPage && (
        <div className="pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              "Load more"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
