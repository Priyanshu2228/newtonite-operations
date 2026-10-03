"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTeams, fetchTeamMembers } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TEAM_ROLE_LABELS } from "@/lib/display-helpers";
import {
  Building2,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  User,
  Crown,
} from "lucide-react";
import type { Team } from "@/lib/api-types";
import Link from "next/link";
import { TeamUpdates } from "@/components/team-updates";

function MemberList({ teamId }: { teamId: string }) {
  const { personaId } = usePersona();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["team-members", personaId, teamId],
    queryFn: () => fetchTeamMembers(teamId),
    // fetchTeamMembers requires Admin or Lead access — silently handle 403
  });

  if (isLoading) {
    return (
      <div className="space-y-1.5 pt-3 border-t border-border">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground italic">
          Member list requires Lead or Admin access
        </p>
      </div>
    );
  }

  if (!data || data.members.length === 0) {
    return (
      <div className="pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground italic">No members yet</p>
      </div>
    );
  }

  const leads = data.members.filter((m) => m.teamRole === "LEAD");
  const members = data.members.filter((m) => m.teamRole === "MEMBER");
  const viewers = data.members.filter((m) => m.teamRole === "VIEWER");

  return (
    <div className="pt-3 border-t border-border space-y-2">
      {leads.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Lead
          </p>
          {leads.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1">
              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-foreground">{m.user.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{m.user.email}</span>
            </div>
          ))}
        </div>
      )}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Members
          </p>
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-foreground">{m.user.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{m.user.email}</span>
            </div>
          ))}
        </div>
      )}
      {viewers.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Viewers
          </p>
          {viewers.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1">
              <User className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-xs text-muted-foreground">{m.user.name}</span>
              <span className="text-xs text-muted-foreground/60 ml-auto">{m.user.email}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";

function TeamCard({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cn("bg-card border border-border transition-all", expanded && "md:col-span-2 xl:col-span-3")}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex items-center justify-center w-9 h-9 bg-blue-50 dark:bg-blue-900/20 shrink-0">
            <Building2 className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400 h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-foreground leading-tight">{team.name}</h3>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {team.description}
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6">
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {team._count?.members ?? 0}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Users className="h-3 w-3" />
              Members
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {team._count?.workItems ?? 0}
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <AlertCircle className="h-3 w-3" />
              Active work
            </p>
          </div>
          <div className="ml-auto">
            <Link
              href={`/work-items?teamId=${team.id}`}
              className="text-xs text-blue-600 hover:underline"
            >
              View queue →
            </Link>
          </div>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2.5 border-t border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <span>{expanded ? "Hide details" : "Show details"}</span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Details */}
      {expanded && (
        <div className="px-5 pb-5 space-y-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0">
              Team Updates
            </p>
            <TeamUpdates teamId={team.id} />
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0">
              Members
            </p>
            <MemberList teamId={team.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsPage() {
  const { personaId } = usePersona();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["teams", personaId],
    queryFn: fetchTeams,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Teams</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Team composition, membership, and active work
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-600 py-8">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load teams</span>
        </div>
      )}

      {data && data.teams.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-foreground font-medium">No teams visible</p>
          <p className="text-muted-foreground text-sm mt-1">
            You have not been assigned to any teams
          </p>
        </div>
      )}

      {data && data.teams.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border border border-border">
          {data.teams.map((t) => (
            <TeamCard key={t.id} team={t} />
          ))}
        </div>
      )}
    </div>
  );
}
