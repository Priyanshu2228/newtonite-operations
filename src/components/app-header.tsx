"use client";

import React from "react";
import Link from "next/link";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { Zap } from "lucide-react";

export function AppHeader() {
  return (
    <header className="glass-header sticky top-0 z-40 flex items-center justify-between px-6 py-3">
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 group-hover:bg-blue-500 transition-colors">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-100">
          Newtonite
        </span>
        <span className="text-xs text-slate-500 font-medium hidden sm:block">Operations</span>
      </Link>
      <PersonaSwitcher />
    </header>
  );
}
