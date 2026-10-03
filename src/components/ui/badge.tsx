import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants: Record<string, string> = {
  default: "bg-slate-700 text-slate-200",
  secondary: "bg-slate-800 text-slate-300",
  destructive: "bg-red-900/50 text-red-300 border border-red-800",
  outline: "border border-slate-600 text-slate-300",
  success: "bg-emerald-900/50 text-emerald-300 border border-emerald-800",
  warning: "bg-amber-900/50 text-amber-300 border border-amber-800",
  info: "bg-blue-900/50 text-blue-300 border border-blue-800",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
