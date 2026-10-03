export interface Persona {
  id: string;
  name: string;
  email: string;
}

export const PERSONAS = {
  ADMIN: {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Admin",
    email: "admin@newtonite.local",
  },
  FINANCE_LEAD: {
    id: "00000000-0000-4000-a000-000000000002",
    name: "Finance Lead",
    email: "finance.lead@newtonite.local",
  },
  FINANCE_MEMBER_1: {
    id: "00000000-0000-4000-a000-000000000003",
    name: "Finance Member 1",
    email: "finance.member1@newtonite.local",
  },
  FINANCE_MEMBER_2: {
    id: "00000000-0000-4000-a000-000000000004",
    name: "Finance Member 2",
    email: "finance.member2@newtonite.local",
  },
  ENGINEERING_MEMBER: {
    id: "00000000-0000-4000-a000-000000000005",
    name: "Engineering Member",
    email: "engineering.member@newtonite.local",
  },
  ENGINEERING_VIEWER: {
    id: "00000000-0000-4000-a000-000000000006",
    name: "Engineering Viewer",
    email: "engineering.viewer@newtonite.local",
  },
} as const;
