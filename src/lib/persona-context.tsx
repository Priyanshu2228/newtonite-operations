"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PERSONAS } from "@/lib/personas";

interface PersonaContextValue {
  personaId: string;
  setPersonaId: (id: string) => void;
}

const PersonaContext = createContext<PersonaContextValue>({
  personaId: PERSONAS.ADMIN.id,
  setPersonaId: () => {},
});

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [personaId, setPersonaIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("newtonite:personaId") ?? PERSONAS.ADMIN.id;
    }
    return PERSONAS.ADMIN.id;
  });

  const queryClient = useQueryClient();

  const setPersonaId = useCallback(
    (id: string) => {
      localStorage.setItem("newtonite:personaId", id);
      setPersonaIdState(id);
      // Completely discard cache and force reload to fetch with new X-User-Id
      queryClient.clear();
      window.location.reload();
    },
    [queryClient]
  );

  return (
    <PersonaContext.Provider value={{ personaId, setPersonaId }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  return useContext(PersonaContext);
}

export const ALL_PERSONAS = [
  PERSONAS.ADMIN,
  PERSONAS.FINANCE_LEAD,
  PERSONAS.FINANCE_MEMBER_1,
  PERSONAS.FINANCE_MEMBER_2,
  PERSONAS.ENGINEERING_MEMBER,
  PERSONAS.ENGINEERING_VIEWER,
] as const;
