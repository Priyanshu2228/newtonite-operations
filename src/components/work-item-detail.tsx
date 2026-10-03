"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWorkItem, claimWorkItem } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import Link from "next/link";

interface WorkItemDetailProps {
  id: string;
}

export function WorkItemDetail({ id }: WorkItemDetailProps) {
  const { personaId } = usePersona();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const { data: item, isLoading, isError, error } = useQuery({
    queryKey: ["work-item", personaId, id],
    queryFn: () => fetchWorkItem(id),
    refetchOnWindowFocus: true, // SPEC §45
  });

  const claimMutation = useMutation({
    mutationFn: () => claimWorkItem(id, item!.version),
    onSuccess: (updated) => {
      queryClient.setQueryData(["work-item", personaId, id], updated);
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      setClaimError(null);
    },
    onError: (err: any) => {
      setClaimError(err.message ?? "Failed to claim");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
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
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-slate-300 font-medium text-lg">
          {errCode === "NOT_FOUND"
            ? "Work item not found"
            : errCode === "FORBIDDEN"
            ? "Access denied"
            : "Failed to load work item"}
        </p>
        <p className="text-slate-500 text-sm mt-1">{(error as any)?.message}</p>
        <Link href="/" className="mt-6">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to list
          </Button>
        </Link>
      </div>
    );
  }

  if (!item) return null;

  const overdue = isOverdue(item);
  const isAssignedToMe = item.assigneeId === personaId;
  const isUnassigned = !item.assigneeId;
  const isClosed = item.status === "CLOSED";

  return (
    <div className="space-y-6">
      {/* Back nav + actions */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {/* Claim button – visible when unassigned and not closed */}
          {isUnassigned && !isClosed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setClaimError(null); claimMutation.mutate(); }}
              disabled={claimMutation.isPending}
            >
              {claimMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1" />
              )}
              Claim
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </div>
      </div>

      {/* Claim error */}
      {claimError && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 flex items-center gap-2 text-sm text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {claimError}
        </div>
      )}

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: main detail */}
        <div className="lg:col-span-2 space-y-5">
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
                  Overdue
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-100">{item.title}</h1>
            <p className="text-slate-400 mt-1 text-sm">
              {CATEGORY_LABELS[item.category]}
            </p>
          </div>

          <Card>
            <CardContent className="pt-5">
              <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                {item.description}
              </p>
            </CardContent>
          </Card>

          {item.nextAction && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-slate-400">Next Action</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-200 text-sm">{item.nextAction}</p>
              </CardContent>
            </Card>
          )}

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed workItemId={id} />
            </CardContent>
          </Card>
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-4 text-sm">
              {/* Team */}
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 text-xs">Team</p>
                  <p className="text-slate-200">{item.team?.name ?? item.teamId}</p>
                </div>
              </div>

              {/* Creator */}
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 text-xs">Created by</p>
                  <p className="text-slate-200">{item.createdBy?.name ?? item.createdById}</p>
                </div>
              </div>

              {/* Assignee */}
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 text-xs">Assignee</p>
                  <p className={item.assignee ? "text-slate-200" : "text-slate-500"}>
                    {item.assignee ? item.assignee.name : "Unassigned"}
                    {isAssignedToMe && (
                      <span className="ml-1.5 text-xs text-blue-400">(you)</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Due date */}
              {item.dueAt && (
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-slate-500 text-xs">Due</p>
                    <p className={overdue ? "text-red-400 font-medium" : "text-slate-200"}>
                      {formatDateTime(item.dueAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Version */}
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 text-xs">Version</p>
                  <p className="text-slate-400">v{item.version}</p>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-1">
                <p className="text-slate-500 text-xs">
                  Created {formatRelative(item.createdAt)}
                </p>
                <p className="text-slate-500 text-xs">
                  Updated {formatRelative(item.updatedAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <EditWorkItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
