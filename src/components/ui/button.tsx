import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantClasses: Record<string, string> = {
  default: "bg-slate-700 text-slate-100 hover:bg-slate-600 shadow",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline: "border border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-slate-100 shadow-sm",
  secondary: "bg-slate-800 text-slate-200 hover:bg-slate-700 shadow-sm",
  ghost: "text-slate-300 hover:bg-slate-800 hover:text-slate-100",
  link: "text-blue-400 underline-offset-4 hover:underline",
};

const sizeClasses: Record<string, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-8 text-base",
  icon: "h-9 w-9",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
