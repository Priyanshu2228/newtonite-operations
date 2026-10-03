"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, fetchTeams, patchUserRole, removeTeamMembership, createUser } from "@/lib/api-client";
import { usePersona, ALL_PERSONAS } from "@/lib/persona-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Shield,
  User,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import type { User as UserType } from "@/lib/api-types";
import { GLOBAL_ROLE_LABELS, TEAM_ROLE_LABELS } from "@/lib/display-helpers";

function AddMembershipDialog({
  user,
  teams,
  open,
  onOpenChange,
  onSaved,
}: {
  user: UserType;
  teams: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [teamId, setTeamId] = useState("");
  const [teamRole, setTeamRole] = useState<"LEAD" | "MEMBER" | "VIEWER">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const { personaId } = usePersona();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      patchUserRole(user.id, { memberships: [{ teamId, teamRole }] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", personaId] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: any) => setError(err.message),
  });

  const availableTeams = teams.filter(
    (t) => !user.memberships.some((m) => m.teamId === t.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Team Membership</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={teamRole} onValueChange={(v) => setTeamRole(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LEAD">Lead</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="VIEWER">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!teamId || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddPersonDialog({
  teams,
  open,
  onOpenChange,
  onSaved,
}: {
  teams: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [globalRole, setGlobalRole] = useState<"ADMIN" | "USER">("USER");
  const [teamId, setTeamId] = useState<string>("none");
  const [teamRole, setTeamRole] = useState<"LEAD" | "MEMBER" | "VIEWER">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const { personaId } = usePersona();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createUser({
        name,
        email,
        globalRole,
        teamId: teamId === "none" ? undefined : teamId,
        teamRole: teamId === "none" ? undefined : teamRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", personaId] });
      onSaved();
      onOpenChange(false);
      setName("");
      setEmail("");
      setGlobalRole("USER");
      setTeamId("none");
      setTeamRole("MEMBER");
      setError(null);
    },
    onError: (err: any) => setError(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Person</DialogTitle>
        </DialogHeader>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
        )}
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@newtonite.com" />
            </div>
          </div>
          
          <div className="border-t pt-3">
            <div className="space-y-1.5 mb-3">
              <Label>Global Role</Label>
              <p className="text-xs text-muted-foreground mb-1">Determines global administration access.</p>
              <Select value={globalRole} onValueChange={(v: any) => setGlobalRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User (Standard Access)</SelectItem>
                  <SelectItem value="ADMIN">Admin (Full System Access)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-3">Initial Team Assignment (Optional)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Team</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue placeholder="No team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No initial team</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Team Role</Label>
                <Select value={teamRole} onValueChange={(v: any) => setTeamRole(v)} disabled={teamId === "none"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LEAD">Lead</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name || !email || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Create Person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, teams }: { user: UserType; teams: { id: string; name: string }[] }) {
  const { personaId } = usePersona();
  const queryClient = useQueryClient();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const roleMutation = useMutation({
    mutationFn: (globalRole: "ADMIN" | "USER") =>
      patchUserRole(user.id, { globalRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", personaId] });
      setRoleError(null);
    },
    onError: (err: any) => setRoleError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (teamId: string) => removeTeamMembership(user.id, teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users", personaId] });
    },
  });

  return (
    <div className="bg-card border border-border p-4">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted shrink-0 mt-0.5">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{user.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              user.globalRole === "ADMIN"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {GLOBAL_ROLE_LABELS[user.globalRole]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>

        {/* Global role switcher */}
        <div className="shrink-0">
          <Select
            value={user.globalRole}
            onValueChange={(v) => roleMutation.mutate(v as "ADMIN" | "USER")}
            disabled={roleMutation.isPending}
          >
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USER">User</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {roleError && (
        <p className="text-xs text-red-600 mt-1.5">{roleError}</p>
      )}

      {/* Team memberships */}
      <div className="mt-3 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Team Memberships
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setAddMemberOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {user.memberships.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No team memberships</p>
        ) : (
          <div className="space-y-1">
            {user.memberships.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted group">
                <span className="flex-1 text-xs text-foreground font-medium">{m.team.name}</span>
                <span className="text-xs text-muted-foreground">{TEAM_ROLE_LABELS[m.teamRole]}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50"
                  onClick={() => removeMutation.mutate(m.teamId)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddMembershipDialog
        user={user}
        teams={teams}
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        onSaved={() => {}}
      />
    </div>
  );
}

export default function AdminPage() {
  const { personaId } = usePersona();
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const activePersona = ALL_PERSONAS.find((p) => p.id === personaId);
  const isAdmin = activePersona?.role === "Global Admin";

  const { data: usersData, isLoading, isError } = useQuery({
    queryKey: ["users", personaId],
    queryFn: fetchUsers,
    enabled: isAdmin,
  });

  const { data: teamsData } = useQuery({
    queryKey: ["teams", personaId],
    queryFn: fetchTeams,
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold text-foreground">Admin Area</h1>
        <p className="text-muted-foreground text-sm mt-2">
          Only Global Admins can access this section.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Switch to the Admin persona to explore this area.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">People</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage users, global roles, and team memberships
          </p>
        </div>
        <Button onClick={() => setAddPersonOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add person
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-600 py-8">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load users</span>
        </div>
      )}

      {usersData && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {usersData.users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              teams={teamsData?.teams ?? []}
            />
          ))}
        </div>
      )}

      <AddPersonDialog
        teams={teamsData?.teams ?? []}
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        onSaved={() => {}}
      />
    </div>
  );
}
