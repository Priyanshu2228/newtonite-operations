"use client";

import React from "react";
import { usePersona, ALL_PERSONAS } from "@/lib/persona-context";
import { User, ChevronDown } from "lucide-react";

export function PersonaSwitcher() {
  const { personaId, setPersonaId } = usePersona();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const active = ALL_PERSONAS.find((p) => p.id === personaId) ?? ALL_PERSONAS[0];

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  if (process.env.NEXT_PUBLIC_DEMO_PERSONAS !== "true") return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
      >
        <User className="h-4 w-4 text-blue-400" />
        <span className="max-w-[140px] truncate">{active.name}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-md border border-border bg-background shadow-2xl z-50 p-1">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dev Personas
          </div>
          {ALL_PERSONAS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPersonaId(p.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left ${
                p.id === personaId
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              <span className="font-medium">{p.name}</span>
              <span className="ml-auto text-xs opacity-70 truncate">{p.email.split("@")[0]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
