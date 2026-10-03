import React, { Suspense } from "react";
import { WorkItemFilters } from "@/components/work-item-filters";
import { WorkItemList } from "@/components/work-item-list";
import { CreateWorkItemDialog } from "@/components/create-work-item-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Work Queue</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Operational work items across all teams
          </p>
        </div>
        <CreateWorkItemDialog />
      </div>

      {/* Filters */}
      <Suspense fallback={<Skeleton className="h-10 w-full" />}>
        <WorkItemFilters />
      </Suspense>

      {/* Work item list */}
      <Suspense
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        }
      >
        <WorkItemList />
      </Suspense>
    </div>
  );
}
