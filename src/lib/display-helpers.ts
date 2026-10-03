import type { Status, Priority, Category } from "@/lib/api-types";

export const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  INCIDENT: "Incident",
  COMPLIANCE: "Compliance",
  PAYMENT_INVESTIGATION: "Payment Investigation",
  APPROVAL: "Approval",
  OPERATIONAL_TASK: "Operational Task",
};

export function getStatusVariant(status: Status): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" {
  switch (status) {
    case "OPEN": return "outline";
    case "IN_PROGRESS": return "info";
    case "BLOCKED": return "destructive";
    case "RESOLVED": return "success";
    case "CLOSED": return "secondary";
  }
}

export function getPriorityVariant(priority: Priority): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" {
  switch (priority) {
    case "LOW": return "secondary";
    case "MEDIUM": return "outline";
    case "HIGH": return "warning";
    case "CRITICAL": return "destructive";
  }
}

export function isOverdue(item: { dueAt?: string | null; status: Status }): boolean {
  if (!item.dueAt) return false;
  if (item.status === "CLOSED" || item.status === "RESOLVED") return false;
  return new Date(item.dueAt) < new Date();
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(iso).split(",")[0];
}
