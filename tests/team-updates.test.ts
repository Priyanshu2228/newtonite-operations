import { describe, it, expect, beforeAll } from "vitest";
import { POST, GET } from "@/app/api/teams/[teamId]/updates/route";
import { NextRequest } from "next/server";
import { seed } from "@/lib/seed";
import { PERSONAS } from "@/lib/personas";
import { prisma } from "@/lib/prisma";

const dbUrl = process.env.DATABASE_URL!;

describe("Team Updates API", () => {
  let engTeamId: string;
  let financeTeamId: string;

  beforeAll(async () => {
    await seed(dbUrl);
    const eng = await prisma.team.findUniqueOrThrow({ where: { name: "Engineering" } });
    engTeamId = eng.id;
    const fin = await prisma.team.findUniqueOrThrow({ where: { name: "Finance" } });
    financeTeamId = fin.id;
  });

  const createReq = (method: string, body?: any, personaId?: string) => {
    return new NextRequest(`http://localhost/api/teams/xxx/updates`, {
      method,
      headers: {
        "x-user-id": personaId ?? PERSONAS.ENGINEERING_MEMBER.id,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  it("1. Authorized team member can read updates", async () => {
    const res = await GET(createReq("GET", undefined, PERSONAS.ENGINEERING_MEMBER.id), { params: { teamId: engTeamId } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updates).toBeInstanceOf(Array);
    expect(data.updates.length).toBeGreaterThan(0);
  });

  it("2. Authorized team member can create an update", async () => {
    const res = await POST(createReq("POST", { content: "New update text" }, PERSONAS.ENGINEERING_MEMBER.id), { params: { teamId: engTeamId } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.update.content).toBe("New update text");
    expect(data.update.authorId).toBe(PERSONAS.ENGINEERING_MEMBER.id);
  });

  it("3. Viewer cannot create an update", async () => {
    const res = await POST(createReq("POST", { content: "Viewer update" }, PERSONAS.ENGINEERING_VIEWER.id), { params: { teamId: engTeamId } });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("4. User cannot create an update for an unauthorized team", async () => {
    const res = await POST(createReq("POST", { content: "Sneaky update" }, PERSONAS.ENGINEERING_MEMBER.id), { params: { teamId: financeTeamId } });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("5. Empty state works", async () => {
    // create a new team to ensure it's empty
    const adminReq = createReq("GET", undefined, PERSONAS.ADMIN.id);
    const newTeam = await prisma.team.create({ data: { name: "EmptyTeam" } });
    const res = await GET(adminReq, { params: { teamId: newTeam.id } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updates).toHaveLength(0);
  });
});
