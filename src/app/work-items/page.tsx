import React, { Suspense } from "react";
import { WorkItemFilters } from "@/components/work-item-filters";
import { WorkItemList } from "@/components/work-item-list";
import { CreateWorkItemDialog } from "@/components/create-work-item-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkQueuePage() {
  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Work Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All operational work items across your teams
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
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        }
      >
        <WorkItemList />
      </Suspense>
    </div>
  );
}
