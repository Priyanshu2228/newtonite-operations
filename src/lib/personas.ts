export interface Persona {
  id: string;
  name: string;
  email: string;
  role: string;
  team: string | null;
  teamRole: string | null;
  description: string;
}

export const PERSONAS = {
  ADMIN: {
    id: "00000000-0000-4000-a000-000000000001",
    name: "Alex (Admin)",
    email: "admin@newtonite.local",
    role: "Global Admin",
    team: null,
    teamRole: null,
    description: "Full access to all teams and admin controls",
  },
  FINANCE_LEAD: {
    id: "00000000-0000-4000-a000-000000000002",
    name: "Jordan (Finance Lead)",
    email: "finance.lead@newtonite.local",
    role: "User",
    team: "Finance",
    teamRole: "Lead",
    description: "Finance team lead — can assign and manage all Finance work items",
  },
  FINANCE_MEMBER_1: {
    id: "00000000-0000-4000-a000-000000000003",
    name: "Sam (Finance Member)",
    email: "finance.member1@newtonite.local",
    role: "User",
    team: "Finance",
    teamRole: "Member",
    description: "Finance team member — can edit own assigned items",
  },
  FINANCE_MEMBER_2: {
    id: "00000000-0000-4000-a000-000000000004",
    name: "Riley (Finance Member)",
    email: "finance.member2@newtonite.local",
    role: "User",
    team: "Finance",
    teamRole: "Member",
    description: "Finance team member — can edit own assigned items",
  },
  ENGINEERING_MEMBER: {
    id: "00000000-0000-4000-a000-000000000005",
    name: "Morgan (Eng. Member)",
    email: "engineering.member@newtonite.local",
    role: "User",
    team: "Engineering",
    teamRole: "Member",
    description: "Engineering team member — can claim and edit own Engineering items",
  },
  ENGINEERING_VIEWER: {
    id: "00000000-0000-4000-a000-000000000006",
    name: "Casey (Eng. Viewer)",
    email: "engineering.viewer@newtonite.local",
    role: "User",
    team: "Engineering",
    teamRole: "Viewer",
    description: "Engineering viewer — read-only access",
  },
} as const;
