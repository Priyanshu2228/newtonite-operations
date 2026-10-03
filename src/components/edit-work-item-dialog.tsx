"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { patchWorkItem, fetchTeamMembers } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import type { WorkItem, Status, Priority } from "@/lib/api-types";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/display-helpers";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

const STATUSES: Status[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED"];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

interface EditWorkItemDialogProps {
  item: WorkItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWorkItemDialog({ item, open, onOpenChange }: EditWorkItemDialogProps) {
  const { personaId } = usePersona();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    assigneeId: item.assigneeId ?? "",
    nextAction: item.nextAction ?? "",
    dueAt: item.dueAt ? item.dueAt.split("T")[0] : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [staleConflict, setStaleConflict] = useState(false);

  // Reset form when item changes
  useEffect(() => {
    setForm({
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      assigneeId: item.assigneeId ?? "",
      nextAction: item.nextAction ?? "",
      dueAt: item.dueAt ? item.dueAt.split("T")[0] : "",
    });
    setStaleConflict(false);
    setError(null);
  }, [item.id, item.version]);

  // Fetch assignable members
  const { data: membersData } = useQuery({
    queryKey: ["team-members", personaId, item.teamId],
    queryFn: () => fetchTeamMembers(item.teamId),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof patchWorkItem>[1]) =>
      patchWorkItem(item.id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["work-item", personaId, item.id], updated);
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      if (err.code === "STALE_VERSION") {
        setStaleConflict(true);
      } else {
        setError(err.message ?? "Failed to update work item");
      }
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStaleConflict(false);
    mutation.mutate({
      version: item.version,
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      priority: form.priority,
      assigneeId: form.assigneeId || null,
      nextAction: form.nextAction.trim() || null,
      dueAt: form.dueAt || null,
    });
  }

  function handleReload() {
    queryClient.invalidateQueries({ queryKey: ["work-item", personaId, item.id] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Work Item</DialogTitle>
        </DialogHeader>

        {/* Stale Version Conflict */}
        {staleConflict && (
          <div className="rounded-xl border border-amber-700 bg-amber-950/50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Edit Conflict</span>
            </div>
            <p className="text-sm text-amber-200">
              This item was modified by someone else. Your draft is preserved below.
              You can reload the latest version or continue editing.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReload} className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                Reload latest
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setStaleConflict(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assignee</Label>
            <Select
              value={form.assigneeId}
              onValueChange={(v) => setForm({ ...form, assigneeId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {membersData?.members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-nextAction">Next Action</Label>
              <Input
                id="edit-nextAction"
                value={form.nextAction}
                onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                placeholder="What needs to happen"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-dueAt">Due Date</Label>
              <Input
                id="edit-dueAt"
                type="date"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
