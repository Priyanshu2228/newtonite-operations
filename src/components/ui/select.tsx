"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

interface SelectContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  labels: Record<string, string>;
  registerLabel: (value: string, label: string) => void;
}

const SelectContext = React.createContext<SelectContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: React.createRef<HTMLButtonElement>(),
  labels: {},
  registerLabel: () => {},
});

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const registerLabel = React.useCallback((val: string, label: string) => {
    setLabels((prev) => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label };
    });
  }, []);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, triggerRef, labels, registerLabel }}>
      <div className="relative" aria-disabled={disabled}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen, triggerRef } = React.useContext(SelectContext);
  return (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", open && "rotate-180")} />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value, labels } = React.useContext(SelectContext);
  const displayLabel = value !== undefined && value !== "" ? (labels[value] ?? value) : placeholder;
  return <span className={value ? "" : "text-slate-500"}>{displayLabel}</span>;
}

export function SelectContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, triggerRef } = React.useContext(SelectContext);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, setOpen, triggerRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 mt-1 w-full min-w-[8rem] overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    >
      <div className="p-1 max-h-60 overflow-y-auto">{children}</div>
    </div>
  );
}

export function SelectItem({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(SelectContext);
  const isSelected = ctx.value === value;

  React.useEffect(() => {
    let text = "";
    if (typeof children === "string") {
      text = children;
    } else if (typeof children === "number") {
      text = String(children);
    } else if (React.isValidElement(children)) {
      text = String((children.props as any)?.children ?? "");
    }
    if (text) {
      ctx.registerLabel(value, text);
    }
  }, [value, children, ctx]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-slate-200 outline-none transition-colors hover:bg-slate-800 focus:bg-slate-800",
        isSelected && "bg-slate-800 font-medium",
        className
      )}
      onClick={() => {
        ctx.onValueChange?.(value);
        ctx.setOpen(false);
      }}
      {...props}
    >
      {children}
    </div>
  );
}
