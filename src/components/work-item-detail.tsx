"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWorkItem, claimWorkItem, patchWorkItem, addComment } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ActivityFeed } from "@/components/activity-feed";
import { EditWorkItemDialog } from "@/components/edit-work-item-dialog";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  CATEGORY_LABELS,
  getStatusVariant,
  getPriorityVariant,
  isOverdue,
  formatDateTime,
  formatRelative,
  formatDueLabel,
} from "@/lib/display-helpers";
import { usePersona } from "@/lib/persona-context";
import {
  ArrowLeft,
  Edit2,
  User,
  Clock,
  AlertTriangle,
  Shield,
  Tag,
  Users,
  CheckCircle,
  Loader2,
  AlertCircle,
  MessageSquare,
  Send,
  Building2,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { Status } from "@/lib/api-types";

interface WorkItemDetailProps {
  id: string;
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/60 last:border-0">
      <div className="mt-0.5 w-4 shrink-0 flex justify-center">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <div className="text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["BLOCKED", "RESOLVED"],
  BLOCKED: ["IN_PROGRESS"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
};

const STATUS_ACTION_LABELS: Partial<Record<Status, string>> = {
  IN_PROGRESS: "Start Working",
  BLOCKED: "Mark Blocked",
  RESOLVED: "Mark Resolved",
  CLOSED: "Close",
};

export function WorkItemDetail({ id }: WorkItemDetailProps) {
  const { personaId } = usePersona();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  const { data: item, isLoading, isError, error } = useQuery({
    queryKey: ["work-item", personaId, id],
    queryFn: () => fetchWorkItem(id),
    refetchOnWindowFocus: true,
  });

  const claimMutation = useMutation({
    mutationFn: () => claimWorkItem(id, item!.version),
    onSuccess: (updated) => {
      queryClient.setQueryData(["work-item", personaId, id], updated);
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["activity", personaId, id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setClaimError(null);
    },
    onError: (err: any) => {
      setClaimError(err.message ?? "Failed to claim");
    },
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: Status) =>
      patchWorkItem(id, { version: item!.version, status: newStatus }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["work-item", personaId, id], updated);
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["activity", personaId, id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: () => addComment(id, comment.trim()),
    onSuccess: () => {
      setComment("");
      setCommentError(null);
      queryClient.invalidateQueries({ queryKey: ["activity", personaId, id] });
    },
    onError: (err: any) => {
      setCommentError(err.message ?? "Failed to add comment");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    const errCode = (error as any)?.code;
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-foreground font-semibold text-lg">
          {errCode === "NOT_FOUND"
            ? "Work item not found"
            : errCode === "FORBIDDEN"
            ? "Access denied"
            : "Failed to load work item"}
        </p>
        <p className="text-muted-foreground text-sm mt-1">{(error as any)?.message}</p>
        <Link href="/work-items" className="mt-6">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to queue
          </Button>
        </Link>
      </div>
    );
  }

  if (!item) return null;

  const overdue = isOverdue(item);
  const dueLabel = item.dueAt ? formatDueLabel(item.dueAt, item.status) : null;
  const isAssignedToMe = item.assigneeId === personaId;
  const isUnassigned = !item.assigneeId;
  const isClosed = item.status === "CLOSED";
  const nextStatuses = STATUS_TRANSITIONS[item.status] ?? [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb / nav */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/work-items" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Work Queue
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-xs">{item.title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick status transitions */}
          {nextStatuses.slice(0, 2).map((s) => (
            <Button
              key={s}
              variant={s === "RESOLVED" ? "default" : s === "BLOCKED" ? "destructive" : "outline"}
              size="sm"
              onClick={() => statusMutation.mutate(s)}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {STATUS_ACTION_LABELS[s] ?? STATUS_LABELS[s]}
            </Button>
          ))}

          {/* Claim button */}
          {isUnassigned && !isClosed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setClaimError(null); claimMutation.mutate(); }}
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <UserCheck className="h-3.5 w-3.5 mr-1" />
              )}
              Claim
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {(claimError || statusMutation.error) && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {claimError ?? (statusMutation.error as any)?.message}
        </div>
      )}

      {/* Overdue banner */}
      {overdue && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-400">
          <Clock className="h-4 w-4 shrink-0" />
          <strong>{dueLabel?.label}</strong> — this item requires immediate attention.
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Title & badges */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant={getStatusVariant(item.status)}>
                {STATUS_LABELS[item.status]}
              </Badge>
              <Badge variant={getPriorityVariant(item.priority)}>
                {PRIORITY_LABELS[item.priority]}
              </Badge>
              {overdue && (
                <Badge variant="destructive" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {dueLabel?.label}
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-foreground">{item.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {CATEGORY_LABELS[item.category]} · Updated {formatRelative(item.updatedAt)}
            </p>
          </div>

          {/* Description */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {item.description}
            </p>
          </div>

          {/* Next action */}
          {item.nextAction && (
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900 p-4">
              <h3 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-1">
                Next Action
              </h3>
              <p className="text-sm text-blue-900 dark:text-blue-200">{item.nextAction}</p>
            </div>
          )}

          {/* Comments */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              Add Comment
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Record a work update, decision, or progress note — visible to all team members.
            </p>
            {commentError && (
              <p className="text-xs text-red-600 mb-2">{commentError}</p>
            )}
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What's happening with this item? Add context, decisions, or blockers…"
              rows={3}
              className="text-sm"
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={() => commentMutation.mutate()}
                disabled={!comment.trim() || commentMutation.isPending}
              >
                {commentMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Send className="h-3.5 w-3.5 mr-1" />
                )}
                Post Comment
              </Button>
            </div>
          </div>

          {/* Activity feed */}
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Activity Timeline
            </h3>
            <ActivityFeed workItemId={id} />
          </div>
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Details
            </h3>
            <MetaRow icon={Building2} label="Team">
              {item.team?.name ?? item.teamId}
            </MetaRow>
            <MetaRow icon={User} label="Assignee">
              {item.assignee ? (
                <span>
                  {item.assignee.name}
                  {isAssignedToMe && (
                    <span className="ml-1.5 text-xs text-blue-600 font-medium">(you)</span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground italic">Unassigned</span>
              )}
            </MetaRow>
            <MetaRow icon={Shield} label="Created by">
              {item.createdBy?.name ?? item.createdById}
            </MetaRow>
            {item.dueAt && (
              <MetaRow icon={Clock} label="Due date">
                <span className={dueLabel?.urgent ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                  {formatDateTime(item.dueAt)}
                  {dueLabel && (
                    <span className={`ml-1.5 text-xs ${dueLabel.urgent ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                      ({dueLabel.label})
                    </span>
                  )}
                </span>
              </MetaRow>
            )}
            <MetaRow icon={Tag} label="Version">
              <span className="text-muted-foreground font-mono text-xs">v{item.version}</span>
            </MetaRow>
          </div>

          <div className="bg-card rounded-xl border border-border p-4 space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
              Timestamps
            </h3>
            <p className="text-xs text-muted-foreground">
              Created: {formatDateTime(item.createdAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              Updated: {formatDateTime(item.updatedAt)}
            </p>
          </div>

          {/* Quick status menu */}
          {!isClosed && nextStatuses.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Change Status
              </h3>
              <div className="space-y-1">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => statusMutation.mutate(s)}
                    disabled={statusMutation.isPending}
                  >
                    {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <EditWorkItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
