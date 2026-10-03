"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchTeams } from "@/lib/api-client";
import { usePersona } from "@/lib/persona-context";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import type { Status, Priority, Category } from "@/lib/api-types";
import { STATUS_LABELS, PRIORITY_LABELS, CATEGORY_LABELS } from "@/lib/display-helpers";

const STATUSES: Status[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "RESOLVED", "CLOSED"];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const CATEGORIES: Category[] = [
  "INCIDENT",
  "COMPLIANCE",
  "PAYMENT_INVESTIGATION",
  "APPROVAL",
  "OPERATIONAL_TASK",
];

export function WorkItemFilters() {
  const { personaId } = usePersona();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const searchVal = sp.get("search") ?? "";
  const [localSearch, setLocalSearch] = React.useState(searchVal);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: teamsData } = useQuery({
    queryKey: ["teams", personaId],
    queryFn: fetchTeams,
  });

  // Sync local search with URL
  useEffect(() => {
    setLocalSearch(sp.get("search") ?? "");
  }, [sp]);

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(sp.toString());
      if (value && value !== "") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // reset page on filter change
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [sp, router, pathname]
  );

  // Debounced search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setLocalSearch(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("search", v), 350);
  };

  const clearAll = () => {
    setLocalSearch("");
    router.push(pathname);
  };

  const hasFilters =
    sp.get("search") ||
    sp.get("teamId") ||
    sp.get("status") ||
    sp.get("priority") ||
    sp.get("category") ||
    sp.get("assigneeId") ||
    sp.get("overdue");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search work items..."
            value={localSearch}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>

        {/* Team filter */}
        <Select
          value={sp.get("teamId") ?? ""}
          onValueChange={(v) => updateParam("teamId", v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Teams</SelectItem>
            {teamsData?.teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={sp.get("status") ?? ""}
          onValueChange={(v) => updateParam("status", v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Priority filter */}
        <Select
          value={sp.get("priority") ?? ""}
          onValueChange={(v) => updateParam("priority", v)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select
          value={sp.get("category") ?? ""}
          onValueChange={(v) => updateParam("category", v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Assignee filter */}
        <Select
          value={sp.get("assigneeId") ?? ""}
          onValueChange={(v) => updateParam("assigneeId", v)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Anyone</SelectItem>
            <SelectItem value="me">Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
          </SelectContent>
        </Select>

        {/* Overdue */}
        <Select
          value={sp.get("overdue") === "true" ? "true" : ""}
          onValueChange={(v) => updateParam("overdue", v)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Overdue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Any Due</SelectItem>
            <SelectItem value="true">Overdue</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select
          value={sp.get("sort") ?? "attention"}
          onValueChange={(v) => updateParam("sort", v)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="attention">Needs attention</SelectItem>
            <SelectItem value="dueAt">Due Date</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
            <SelectItem value="updatedAt">Recently updated</SelectItem>
            <SelectItem value="createdAt">Created</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1">
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
