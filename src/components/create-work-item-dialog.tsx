"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams, fetchTeamMembers, createWorkItem } from "@/lib/api-client";
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
import type { Category, Priority } from "@/lib/api-types";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/lib/display-helpers";
import { Plus, Loader2 } from "lucide-react";

const CATEGORIES: Category[] = [
  "INCIDENT",
  "COMPLIANCE",
  "PAYMENT_INVESTIGATION",
  "APPROVAL",
  "OPERATIONAL_TASK",
];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function CreateWorkItemDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "" as Category | "",
    teamId: "",
    priority: "MEDIUM" as Priority,
    nextAction: "",
    dueAt: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: fetchTeams,
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: createWorkItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-items"] });
      setOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err.message ?? "Failed to create work item");
    },
  });

  function resetForm() {
    setForm({
      title: "",
      description: "",
      category: "",
      teamId: "",
      priority: "MEDIUM",
      nextAction: "",
      dueAt: "",
    });
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError("Title is required");
    if (!form.description.trim()) return setError("Description is required");
    if (!form.category) return setError("Category is required");
    if (!form.teamId) return setError("Team is required");

    mutation.mutate({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category as Category,
      teamId: form.teamId,
      priority: form.priority,
      nextAction: form.nextAction.trim() || undefined,
      dueAt: form.dueAt || undefined,
    });
  }

  return (
    <>
      <Button onClick={() => { setOpen(true); resetForm(); }} className="gap-2">
        <Plus className="h-4 w-4" />
        New Item
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Work Item</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-title">Title *</Label>
              <Input
                id="create-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Brief title"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-description">Description *</Label>
              <Textarea
                id="create-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detailed description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Team *</Label>
                <Select value={form.teamId} onValueChange={(v) => setForm({ ...form, teamId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamsData?.teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="space-y-1.5">
                <Label htmlFor="create-dueAt">Due Date</Label>
                <Input
                  id="create-dueAt"
                  type="date"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-nextAction">Next Action</Label>
              <Input
                id="create-nextAction"
                value={form.nextAction}
                onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                placeholder="What needs to happen next"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={mutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
