import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants: Record<string, string> = {
  default: "bg-primary text-primary-foreground border border-transparent",
  secondary: "bg-muted text-muted-foreground border border-transparent",
  destructive: "bg-red-50 text-red-700 border border-red-200",
  outline: "bg-transparent border border-border text-foreground",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors uppercase tracking-wide",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
