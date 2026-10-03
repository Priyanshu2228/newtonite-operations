import { prisma } from "../lib/prisma";
import { WorkItem, Prisma, TeamRole, ActivityAction } from "@prisma/client";
import { AssigneeNotTeamMemberError } from "../lib/errors";

export class WorkItemRepository {
  static async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx || prisma;
    return client.workItem.findUnique({
      where: { id },
      include: {
        team: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  static async validateAssigneeMembership(
    teamId: string,
    assigneeId: string,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx || prisma;
    const membership = await client.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: assigneeId,
          teamId,
        },
      },
    });

    if (!membership || membership.teamRole === TeamRole.VIEWER) {
      throw new AssigneeNotTeamMemberError(
        "Assignee must be a member of the team with LEAD or MEMBER role"
      );
    }
  }

  static async atomicUpdate(
    id: string,
    expectedVersion: number,
    data: Prisma.WorkItemUpdateInput,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || prisma;
    const result = await client.workItem.updateMany({
      where: {
        id,
        version: expectedVersion,
      },
      data: {
        ...data,
        version: {
          increment: 1,
        },
      },
    });
    return result.count;
  }

  static async atomicClaim(
    id: string,
    assigneeId: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = tx || prisma;
    const result = await client.workItem.updateMany({
      where: {
        id,
        assigneeId: null,
        status: {
          not: "CLOSED",
        },
      },
      data: {
        assigneeId,
        version: {
          increment: 1,
        },
      },
    });
    return result.count;
  }
}
