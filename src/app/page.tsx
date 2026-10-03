"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboard } from "@/lib/api-client";
import { usePersona, ALL_PERSONAS } from "@/lib/persona-context";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/display-helpers";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Users,
  TrendingUp,
  Ban,
  MessageSquare,
  UserCheck,
  GitMerge,
  Plus,
  BarChart3,
} from "lucide-react";
import Link from "next/link";

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: Plus,
  UPDATED: Activity,
  STATUS_CHANGED: GitMerge,
  ASSIGNED: UserCheck,
  UNASSIGNED: Users,
  PRIORITY_CHANGED: TrendingUp,
  COMMENT_ADDED: MessageSquare,
};

function describeAction(action: string, details: Record<string, unknown> | null): string {
  switch (action) {
    case "CREATED": return "created a work item";
    case "STATUS_CHANGED": return `changed status: ${details?.from} → ${details?.to}`;
    case "ASSIGNED": return details?.via === "claim" ? "claimed a work item" : "assigned a work item";
    case "UNASSIGNED": return "removed assignee";
    case "PRIORITY_CHANGED": return `changed priority: ${details?.from} → ${details?.to}`;
    case "COMMENT_ADDED": return "added a comment";
    case "UPDATED": return "updated a work item";
    default: return action.toLowerCase().replace(/_/g, " ");
  }
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  href?: string;
}

function StatCard({ label, value, icon: Icon, color = "text-blue-600", href }: StatCardProps) {
  const content = (
    <div className="stat-card group hover:border-border/80 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between mb-2">
        <p className="stat-card-label">{label}</p>
        <div className={`${color} opacity-70 group-hover:opacity-100 transition-opacity`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={`stat-card-value ${color}`}>{value}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export default function DashboardPage() {
  const { personaId } = usePersona();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", personaId],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
  });

  const isAdmin = ALL_PERSONAS.find((p) => p.id === personaId)?.role === "Global Admin";

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Operational overview — live summary of your work
        </p>
      </div>

      {/* My Work */}
      <section>
        <div className="section-header">
          <h2 className="section-title">My Work</h2>
          <Link
            href={`/work-items?assigneeId=${personaId}`}
            className="text-xs text-blue-600 hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active"
            value={data.my.active}
            icon={Inbox}
            color="text-blue-600"
            href={`/work-items?assigneeId=${personaId}`}
          />
          <StatCard
            label="Due Today"
            value={data.my.dueToday}
            icon={Clock}
            color="text-amber-600"
          />
          <StatCard
            label="Overdue"
            value={data.my.overdue}
            icon={AlertTriangle}
            color={data.my.overdue > 0 ? "text-red-600" : "text-muted-foreground"}
          />
          <StatCard
            label="Blocked"
            value={data.my.blocked}
            icon={Ban}
            color={data.my.blocked > 0 ? "text-red-600" : "text-muted-foreground"}
          />
        </div>
      </section>

      {/* Needs Attention */}
      <section>
        <div className="section-header">
          <h2 className="section-title">{isAdmin ? "Organisation" : "Team"} Overview</h2>
          <Link href="/work-items" className="text-xs text-blue-600 hover:underline">
            View queue →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Items"
            value={data.org.totalActive}
            icon={BarChart3}
            color="text-slate-700"
          />
          <StatCard
            label="Unassigned"
            value={data.org.unassigned}
            icon={Users}
            color={data.org.unassigned > 0 ? "text-amber-600" : "text-muted-foreground"}
            href="/work-items?assigneeId=unassigned"
          />
          <StatCard
            label="Overdue"
            value={data.org.overdue}
            icon={AlertTriangle}
            color={data.org.overdue > 0 ? "text-red-600" : "text-muted-foreground"}
            href="/work-items?overdue=true"
          />
          <StatCard
            label="Blocked"
            value={data.org.blocked}
            icon={Ban}
            color={data.org.blocked > 0 ? "text-red-600" : "text-muted-foreground"}
            href="/work-items?status=BLOCKED"
          />
        </div>
      </section>

      {/* Team Breakdown + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team breakdown */}
        {data.teamStats.length > 0 && (
          <section className="bg-card rounded-xl border border-border p-5">
            <h2 className="section-title mb-4">Work by Team</h2>
            <div className="space-y-3">
              {data.teamStats.map((ts) => {
                const inProgress = ts.byStatus["IN_PROGRESS"] ?? 0;
                const blocked = ts.byStatus["BLOCKED"] ?? 0;
                const open = ts.byStatus["OPEN"] ?? 0;
                return (
                  <div key={ts.teamId} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <Link
                        href={`/work-items?teamId=${ts.teamId}`}
                        className="text-sm font-medium text-foreground hover:text-blue-600 transition-colors truncate block"
                      >
                        {ts.teamName}
                      </Link>
                    </div>
                    {/* Mini bar */}
                    <div className="flex-1 flex rounded-full h-2 overflow-hidden bg-muted">
                      {open > 0 && (
                        <div
                          className="bg-slate-300 dark:bg-slate-600"
                          style={{ width: `${(open / ts.total) * 100}%` }}
                        />
                      )}
                      {inProgress > 0 && (
                        <div
                          className="bg-blue-400"
                          style={{ width: `${(inProgress / ts.total) * 100}%` }}
                        />
                      )}
                      {blocked > 0 && (
                        <div
                          className="bg-red-400"
                          style={{ width: `${(blocked / ts.total) * 100}%` }}
                        />
                      )}
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground w-8 text-right shrink-0">
                      {ts.total}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />Open
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-blue-400" />In Progress
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-red-400" />Blocked
              </span>
            </div>
          </section>
        )}

        {/* Recent Activity */}
        <section className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-title mb-4">Recent Activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
          ) : (
            <div className="space-y-0">
              {data.recentActivity.map((a) => {
                const Icon = ACTION_ICONS[a.action] ?? Activity;
                return (
                  <div key={a.id} className="flex items-start gap-2.5 py-2.5 border-b border-border/40 last:border-0">
                    <div className="mt-0.5 shrink-0 p-1 rounded-md bg-muted">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug">
                        <span className="font-medium">{a.actor?.name ?? "System"}</span>
                        {" "}
                        {describeAction(a.action, a.details as any)}
                        {a.workItem && (
                          <span className="text-muted-foreground">
                            {" "}on{" "}
                            <Link
                              href={`/work-items/${a.workItem.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {a.workItem.title.length > 40
                                ? a.workItem.title.slice(0, 40) + "…"
                                : a.workItem.title}
                            </Link>
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelative(a.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

