"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePersona, ALL_PERSONAS } from "@/lib/persona-context";
import {
  LayoutDashboard,
  ListChecks,
  Users,
  Shield,
  ChevronDown,
  ChevronUp,
  Zap,
  User,
  Building2,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/work-items", label: "Work Queue", icon: ListChecks },
  { href: "/teams", label: "Teams", icon: Building2 },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { personaId, setPersonaId } = usePersona();
  const pathname = usePathname();
  const [identityOpen, setIdentityOpen] = React.useState(false);
  const identityRef = React.useRef<HTMLDivElement>(null);

  const active = ALL_PERSONAS.find((p) => p.id === personaId) ?? ALL_PERSONAS[0];
  const isAdmin = active.role === "Global Admin";

  React.useEffect(() => {
    function handle(e: MouseEvent) {
      if (identityRef.current && !identityRef.current.contains(e.target as Node)) {
        setIdentityOpen(false);
      }
    }
    if (identityOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [identityOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="app-sidebar">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shrink-0">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">Newtonite</p>
            <p className="text-xs text-muted-foreground mt-0.5">Operations</p>
          </div>
        </div>

        {/* Identity Panel */}
        <div className="px-3 pt-3 pb-2" ref={identityRef}>
          <button
            onClick={() => setIdentityOpen(!identityOpen)}
            className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3 py-2.5 hover:bg-muted transition-colors text-left"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 shrink-0">
              <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{active.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {active.teamRole ? `${active.team} · ${active.teamRole}` : active.role}
              </p>
            </div>
            {identityOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </button>

          {identityOpen && (
            <div className="mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50 relative">
              <div className="px-3 py-2 bg-muted/50 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Evaluator Identity
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Switching personas injects a different <code className="bg-muted px-1 py-0.5 rounded">X-User-Id</code> header into all API requests, allowing you to test RBAC and data isolation.
                </p>
              </div>
              <div className="p-1 max-h-[300px] overflow-y-auto">
                {ALL_PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPersonaId(p.id);
                      setIdentityOpen(false);
                    }}
                    className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      p.id === personaId
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted dark:bg-muted mt-0.5 shrink-0">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                        {p.teamRole ? `${p.team} · ${p.teamRole}` : p.role}
                      </p>
                    </div>
                    {p.id === personaId && (
                      <div className="ml-auto mt-1 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-2">
            Menu
          </p>
          {NAV_ITEMS.filter((n) => !n.adminOnly || isAdmin).map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {active.description}
          </p>
        </div>
      </aside>

      {/* Main content area */}
      <main className="app-main overflow-y-auto">
        <div className="px-6 py-6 max-w-screen-xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
