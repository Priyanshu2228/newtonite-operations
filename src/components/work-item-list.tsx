"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { fetchWorkItems } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  CATEGORY_LABELS,
  getStatusVariant,
  getPriorityVariant,
  isOverdue,
  formatRelative,
} from "@/lib/display-helpers";
import type { WorkItemListParams } from "@/lib/api-types";
import {
  AlertCircle,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

function buildParams(sp: URLSearchParams): WorkItemListParams {
  const params: WorkItemListParams = {};
  const search = sp.get("search");
  if (search) params.search = search;
  const teamId = sp.get("teamId");
  if (teamId) params.teamId = teamId;
  const status = sp.get("status") as any;
  if (status) params.status = status;
  const priority = sp.get("priority") as any;
  if (priority) params.priority = priority;
  const category = sp.get("category") as any;
  if (category) params.category = category;
  const assigneeId = sp.get("assigneeId");
  if (assigneeId) params.assigneeId = assigneeId;
  const overdue = sp.get("overdue");
  if (overdue === "true") params.overdue = true;
  const sort = sp.get("sort") as any;
  if (sort) params.sort = sort;
  const page = sp.get("page");
  if (page) params.page = parseInt(page);
  params.limit = 20;
  return params;
}

export function WorkItemList() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = buildParams(sp);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["work-items", Object.fromEntries(sp.entries())],
    queryFn: () => fetchWorkItems(params),
    placeholderData: (prev) => prev,
  });

  function setPage(page: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(page));
    router.push(`${pathname}?${next.toString()}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
        <p className="text-slate-300 font-medium">Failed to load work items</p>
        <p className="text-slate-500 text-sm mt-1">
          {(error as any)?.message ?? "Unknown error"}
        </p>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Inbox className="h-12 w-12 text-slate-600 mb-4" />
        <p className="text-slate-400 font-medium">No work items found</p>
        <p className="text-slate-600 text-sm mt-1">Try adjusting your filters</p>
      </div>
    );
  }

  const currentPage = data.page;
  const totalPages = data.totalPages;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>
          {data.total} item{data.total !== 1 ? "s" : ""}
          {totalPages > 1 && ` · Page ${currentPage} of ${totalPages}`}
        </span>
      </div>

      <div className="space-y-2">
        {data.items.map((item) => {
          const overdue = isOverdue(item);
          return (
            <Link key={item.id} href={`/work-items/${item.id}`}>
              <Card className="group hover:border-slate-600 hover:bg-slate-800/60 transition-all cursor-pointer p-4">
                <div className="flex items-start gap-3">
                  {/* Priority indicator */}
                  <div
                    className={`mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                      item.priority === "CRITICAL"
                        ? "bg-red-500 badge-urgent"
                        : item.priority === "HIGH"
                        ? "bg-orange-400"
                        : item.priority === "MEDIUM"
                        ? "bg-amber-500"
                        : "bg-slate-600"
                    }`}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-white truncate">
                        {item.title}
                      </h3>
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        <Badge variant={getStatusVariant(item.status)}>
                          {STATUS_LABELS[item.status]}
                        </Badge>
                        <Badge variant={getPriorityVariant(item.priority)}>
                          {PRIORITY_LABELS[item.priority]}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-slate-500">
                      {item.team && (
                        <span className="text-slate-400">{item.team.name}</span>
                      )}
                      <span>·</span>
                      <span>{CATEGORY_LABELS[item.category]}</span>

                      {item.assignee ? (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {item.assignee.name}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>·</span>
                          <span className="text-slate-600">Unassigned</span>
                        </>
                      )}

                      {item.dueAt && (
                        <>
                          <span>·</span>
                          <span
                            className={`flex items-center gap-1 ${
                              overdue ? "text-red-400 font-medium" : ""
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            {overdue ? "Overdue · " : "Due "}
                            {new Date(item.dueAt).toLocaleDateString()}
                          </span>
                        </>
                      )}

                      <span>·</span>
                      <span>Updated {formatRelative(item.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="text-sm text-slate-400">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
