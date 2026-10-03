import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/lib/prisma";
import { PERSONAS } from "../src/lib/personas";
import { IDEMPOTENCY_OPERATION } from "../src/services/idempotency.service";
import { NextRequest } from "next/server";

describe("Session 3 Tests", () => {
  // tests use the globally seeded DB

  const getViewer = async () => prisma.user.findFirstOrThrow({ where: { email: PERSONAS.ENGINEERING_VIEWER.email } });
  const getAdmin = async () => prisma.user.findFirstOrThrow({ where: { email: PERSONAS.ADMIN.email } });
  const getEngMember = async () => prisma.user.findFirstOrThrow({ where: { email: PERSONAS.ENGINEERING_MEMBER.email } });

  describe("Comments Idempotency and VIEWER authorization", () => {
    it("A. first comment request succeeds", async () => {
      const admin = await getAdmin();
      const item = await prisma.workItem.findFirstOrThrow();

      const req = new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": admin.id,
          "X-Idempotency-Key": "key-comment-1",
        },
        body: JSON.stringify({ message: "Test comment" }),
      });

      const { POST } = await import("../src/app/api/work-items/[id]/comments/route");
      const res = await POST(req as any, { params: { id: item.id } });
      expect(res.status).toBe(201);
      
      const record = await prisma.idempotencyRecord.findUnique({
        where: { userId_operation_key: { userId: admin.id, operation: IDEMPOTENCY_OPERATION.COMMENT_ADDED, key: "key-comment-1" } },
      });
      expect(record).not.toBeNull();
      expect(record?.statusCode).toBe(201);
    });

    it("B. identical retry replays", async () => {
      const admin = await getAdmin();
      const item = await prisma.workItem.findFirstOrThrow();

      const makeReq = () => new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": admin.id,
          "X-Idempotency-Key": "key-comment-2",
        },
        body: JSON.stringify({ message: "Test comment 2" }),
      });

      const { POST } = await import("../src/app/api/work-items/[id]/comments/route");
      const res1 = await POST(makeReq() as any, { params: { id: item.id } });
      expect(res1.status).toBe(201);

      const res2 = await POST(makeReq() as any, { params: { id: item.id } });
      expect(res2.status).toBe(201);
      expect(res2.headers.get("Idempotent-Replayed")).toBe("true");

      // Verify only 1 comment added
      const activities = await prisma.activity.findMany({ where: { action: "COMMENT_ADDED", workItemId: item.id } });
      expect(activities.filter(a => (a.details as any).message === "Test comment 2").length).toBe(1);
    });

    it("C. same key + different body returns IDEMPOTENCY_KEY_REUSE", async () => {
      const admin = await getAdmin();
      const item = await prisma.workItem.findFirstOrThrow();

      const { POST } = await import("../src/app/api/work-items/[id]/comments/route");
      await POST(new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": admin.id, "X-Idempotency-Key": "key-comment-3" },
        body: JSON.stringify({ message: "Test comment 3" }),
      }) as any, { params: { id: item.id } });

      const res2 = await POST(new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": admin.id, "X-Idempotency-Key": "key-comment-3" },
        body: JSON.stringify({ message: "Different body" }),
      }) as any, { params: { id: item.id } });

      expect(res2.status).toBe(409);
      const data = await res2.json();
      expect(data.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
    });

    it("D. failed comment mutation does not leave an idempotency record that incorrectly represents success", async () => {
      const admin = await getAdmin();
      const item = await prisma.workItem.findFirstOrThrow();

      const { POST } = await import("../src/app/api/work-items/[id]/comments/route");
      
      // Send invalid payload to trigger failure
      const res = await POST(new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": admin.id, "X-Idempotency-Key": "key-comment-fail" },
        body: JSON.stringify({ invalid: true }), // Missing message
      }) as any, { params: { id: item.id } });

      expect(res.status).toBe(400); // Invalid request error

      const record = await prisma.idempotencyRecord.findUnique({
        where: { userId_operation_key: { userId: admin.id, operation: IDEMPOTENCY_OPERATION.COMMENT_ADDED, key: "key-comment-fail" } },
      });
      expect(record).toBeNull();
    });

    it("Engineering Viewer -> POST comment -> 403 Forbidden", async () => {
      const viewer = await getViewer();
      // Create a work item in the engineering team
      const engTeam = await prisma.team.findFirstOrThrow({ where: { name: "Engineering" } });
      const item = await prisma.workItem.create({
        data: {
          title: "Test item for viewer",
          description: "Test",
          priority: "LOW",
          category: "OPERATIONAL_TASK",
          status: "OPEN",
          teamId: engTeam.id,
          createdById: viewer.id,
        }
      });

      const { POST } = await import("../src/app/api/work-items/[id]/comments/route");
      const res = await POST(new NextRequest(`http://localhost/api/work-items/${item.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": viewer.id, "X-Idempotency-Key": "key-comment-viewer" },
        body: JSON.stringify({ message: "Viewer trying to comment" }),
      }) as any, { params: { id: item.id } });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.message).toContain("Viewers cannot add comments");
    });
  });

  describe("Fix unassigned filter", () => {
    it("should return items with null assignee when assigneeId=unassigned", async () => {
      const admin = await getAdmin();
      
      const req = new NextRequest("http://localhost/api/work-items?assigneeId=unassigned", {
        headers: { "X-User-Id": admin.id }
      });
      const { GET } = await import("../src/app/api/work-items/route");
      const res = await GET(req as any);
      
      if (res.status !== 200) {
          const body = await res.json();
          throw new Error(`API error: ${JSON.stringify(body)}`);
      }

      const data = await res.json();
      
      expect(data.items).toBeDefined();
      data.items.forEach((item: any) => {
        expect(item.assignee).toBeNull();
      });
    });
  });
});
