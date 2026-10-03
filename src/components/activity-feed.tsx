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
  MessageSquare,
  Loader2,
} from "lucide-react";

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: PlusCircle,
  UPDATED: Edit3,
  STATUS_CHANGED: ArrowRightCircle,
  ASSIGNED: UserCheck,
  UNASSIGNED: UserMinus,
  PRIORITY_CHANGED: BarChart2,
  COMMENT_ADDED: MessageSquare,
};

const ACTION_COLORS: Record<string, string> = {
  CREATED: "text-emerald-600 dark:text-emerald-400",
  UPDATED: "text-blue-600 dark:text-blue-400",
  STATUS_CHANGED: "text-violet-600 dark:text-violet-400",
  ASSIGNED: "text-teal-600 dark:text-teal-400",
  UNASSIGNED: "text-orange-600 dark:text-orange-400",
  PRIORITY_CHANGED: "text-amber-600 dark:text-amber-400",
  COMMENT_ADDED: "text-slate-600 dark:text-slate-400",
};

const ACTION_BG: Record<string, string> = {
  CREATED: "bg-emerald-50 dark:bg-emerald-900/20",
  UPDATED: "bg-blue-50 dark:bg-blue-900/20",
  STATUS_CHANGED: "bg-violet-50 dark:bg-violet-900/20",
  ASSIGNED: "bg-teal-50 dark:bg-teal-900/20",
  UNASSIGNED: "bg-orange-50 dark:bg-orange-900/20",
  PRIORITY_CHANGED: "bg-amber-50 dark:bg-amber-900/20",
  COMMENT_ADDED: "bg-muted",
};

function describeActivity(activity: Activity): { summary: string; detail?: string } {
  const d = activity.details as Record<string, unknown> | null;
  switch (activity.action) {
    case "CREATED":
      return { summary: "Created this work item" };
    case "STATUS_CHANGED":
      return { summary: `Status changed: ${d?.from} → ${d?.to}` };
    case "PRIORITY_CHANGED":
      return { summary: `Priority changed: ${d?.from} → ${d?.to}` };
    case "ASSIGNED":
      return {
        summary: d?.via === "claim" ? "Claimed this item" : `Assigned to a team member`,
      };
    case "UNASSIGNED":
      return { summary: "Removed assignee" };
    case "UPDATED": {
      const fields = d?.fields as string[] | undefined;
      return {
        summary: fields?.length ? `Updated: ${fields.join(", ")}` : "Updated this item",
      };
    }
    case "COMMENT_ADDED":
      return {
        summary: "Added a comment",
        detail: d?.message as string | undefined,
      };
    default:
      return { summary: String(activity.action).toLowerCase().replace(/_/g, " ") };
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
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 py-4">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Failed to load activity</span>
      </div>
    );
  }

  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  if (allItems.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No activity yet</p>
    );
  }

  return (
    <div className="space-y-0">
      {allItems.map((activity) => {
        const Icon = ACTION_ICONS[activity.action] ?? Edit3;
        const color = ACTION_COLORS[activity.action] ?? "text-muted-foreground";
        const bg = ACTION_BG[activity.action] ?? "bg-muted";
        const { summary, detail } = describeActivity(activity);

        return (
          <div
            key={activity.id}
            className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0"
          >
            <div className={`mt-0.5 shrink-0 p-1.5 rounded-md ${bg}`}>
              <Icon className={`h-3.5 w-3.5 ${color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">{summary}</p>
              {detail && (
                <p className="text-sm text-muted-foreground mt-1 p-2.5 bg-muted rounded-md leading-relaxed">
                  {detail}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {activity.actor?.name ?? "System"}
                </span>
                <span className="text-xs text-muted-foreground/50">·</span>
                <span
                  className="text-xs text-muted-foreground"
                  title={formatDateTime(activity.createdAt)}
                >
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
            className="w-full text-xs"
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                Loading…
              </>
            ) : (
              "Load earlier activity"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
