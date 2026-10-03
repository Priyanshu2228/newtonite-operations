import React from "react";
import { WorkItemDetail } from "@/components/work-item-detail";

interface WorkItemPageProps {
  params: { id: string };
}

export default function WorkItemPage({ params }: WorkItemPageProps) {
  return <WorkItemDetail id={params.id} />;
}
