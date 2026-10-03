"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTeams, fetchTeamMembers } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Skeleton } from "@/components/ui/skeleton";
import { TEAM_ROLE_LABELS } from "@/lib/display-helpers";
import { Building2, Users, User, AlertCircle } from "lucide-react";

function TeamCard({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { personaId } = usePersona();
  const { data, isLoading } = useQuery({
    queryKey: ["team-members", personaId, teamId],
    queryFn: () => fetchTeamMembers(teamId),
  });

  const leads = data?.members.filter((m) => m.teamRole === "LEAD") ?? [];
  const members = data?.members.filter((m) => m.teamRole === "MEMBER") ?? [];
  const viewers = data?.members.filter((m) => m.teamRole === "VIEWER") ?? [];

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 shrink-0">
          <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{teamName}</h3>
          {!isLoading && data && (
            <p className="text-xs text-muted-foreground">
              {data.members.length} member{data.members.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {[
            { role: "Lead", members: leads },
            { role: "Member", members: members },
            { role: "Viewer", members: viewers },
          ].map(
            ({ role, members: roleMembers }) =>
              roleMembers.length > 0 && (
                <div key={role}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                    {role}s
                  </p>
                  <div className="space-y-1">
                    {roleMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted shrink-0">
                          <User className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">
                            {m.user.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
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
          Team composition and member roles
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-600 py-8">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load teams</span>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.teams.map((t) => (
            <TeamCard key={t.id} teamId={t.id} teamName={t.name} />
          ))}
        </div>
      )}
    </div>
  );
}
