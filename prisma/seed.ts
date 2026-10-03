import { PrismaClient, SystemRole, TeamRole, WorkItemType, Status, Priority } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Newtonite database...');

  // Clean existing data
  await prisma.activityLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.asyncJob.deleteMany();

  // Create Teams
  const engTeam = await prisma.team.create({
    data: { name: 'Engineering', description: 'Core software development & infrastructure team' },
  });
  const supportTeam = await prisma.team.create({
    data: { name: 'Customer Support', description: 'Tier 1 & Tier 2 support operations' },
  });
  const opsTeam = await prisma.team.create({
    data: { name: 'Operations', description: 'Business & site operations' },
  });
  const complianceTeam = await prisma.team.create({
    data: { name: 'Compliance', description: 'Regulatory, legal & risk auditing team' },
  });
  const financeTeam = await prisma.team.create({
    data: { name: 'Finance', description: 'Billing, payments & financial reconciliation' },
  });

  // Create Users
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@newtonite.com',
      name: 'Alex Rivera (Admin)',
      role: SystemRole.ADMIN,
    },
  });

  const engLead = await prisma.user.create({
    data: {
      email: 'lead.eng@newtonite.com',
      name: 'Sarah Chen',
      role: SystemRole.USER,
    },
  });

  const engDev = await prisma.user.create({
    data: {
      email: 'dev.eng@newtonite.com',
      name: 'Marcus Vance',
      role: SystemRole.USER,
    },
  });

  const supportLead = await prisma.user.create({
    data: {
      email: 'lead.support@newtonite.com',
      name: 'Priya Patel',
      role: SystemRole.USER,
    },
  });

  const supportAgent = await prisma.user.create({
    data: {
      email: 'agent.support@newtonite.com',
      name: 'David Kim',
      role: SystemRole.USER,
    },
  });

  const opsLead = await prisma.user.create({
    data: {
      email: 'lead.ops@newtonite.com',
      name: 'Elena Rostova',
      role: SystemRole.USER,
    },
  });

  const complianceLead = await prisma.user.create({
    data: {
      email: 'lead.compliance@newtonite.com',
      name: 'Michael Thorne',
      role: SystemRole.USER,
    },
  });

  const guestViewer = await prisma.user.create({
    data: {
      email: 'viewer.guest@newtonite.com',
      name: 'Jordan Lee (Viewer)',
      role: SystemRole.USER,
    },
  });

  // Team Memberships
  await prisma.teamMember.createMany({
    data: [
      // Eng
      { userId: engLead.id, teamId: engTeam.id, role: TeamRole.LEAD },
      { userId: engDev.id, teamId: engTeam.id, role: TeamRole.MEMBER },
      { userId: adminUser.id, teamId: engTeam.id, role: TeamRole.LEAD },
      // Support
      { userId: supportLead.id, teamId: supportTeam.id, role: TeamRole.LEAD },
      { userId: supportAgent.id, teamId: supportTeam.id, role: TeamRole.MEMBER },
      // Ops
      { userId: opsLead.id, teamId: opsTeam.id, role: TeamRole.LEAD },
      // Compliance
      { userId: complianceLead.id, teamId: complianceTeam.id, role: TeamRole.LEAD },
      // Viewer in support
      { userId: guestViewer.id, teamId: supportTeam.id, role: TeamRole.VIEWER },
    ],
  });

  // Work Items
  const item1 = await prisma.workItem.create({
    data: {
      title: 'Database connection pool exhaustion in prod-east',
      description: 'High latency detected on primary DB cluster due to connection leaks during peak traffic.',
      type: WorkItemType.PRODUCTION_INCIDENT,
      status: Status.IN_PROGRESS,
      priority: Priority.URGENT,
      version: 1,
      assignedTeamId: engTeam.id,
      assignedToId: engDev.id,
      createdById: engLead.id,
      tags: ['database', 'incident', 'urgent'],
    },
  });

  await prisma.activityLog.create({
    data: {
      workItemId: item1.id,
      actorId: engLead.id,
      action: 'CREATED',
      details: { initialStatus: 'OPEN', priority: 'URGENT' },
    },
  });

  await prisma.activityLog.create({
    data: {
      workItemId: item1.id,
      actorId: engDev.id,
      action: 'STATUS_CHANGED',
      details: { oldStatus: 'OPEN', newStatus: 'IN_PROGRESS', reason: 'Investigating query performance' },
    },
  });

  await prisma.comment.create({
    data: {
      workItemId: item1.id,
      authorId: engDev.id,
      content: 'Identified unclosed connection in batch exporter service.',
    },
  });

  const item2 = await prisma.workItem.create({
    data: {
      title: 'Enterprise Client Acme Corp Refund Approval ($45,000)',
      description: 'SLA breach caused service outage. Finance team needs approval before releasing wire refund.',
      type: WorkItemType.OPERATIONAL_APPROVAL,
      status: Status.PENDING_APPROVAL,
      priority: Priority.HIGH,
      version: 1,
      assignedTeamId: financeTeam.id,
      assignedToId: null,
      createdById: supportLead.id,
      tags: ['refund', 'sla', 'compliance'],
    },
  });

  await prisma.activityLog.create({
    data: {
      workItemId: item2.id,
      actorId: supportLead.id,
      action: 'CREATED',
      details: { initialStatus: 'PENDING_APPROVAL', amount: 45000 },
    },
  });

  const item3 = await prisma.workItem.create({
    data: {
      title: 'Suspicious transaction pattern flagged by risk monitor',
      description: 'Multiple card attempts from single IP across 30 user accounts within 5 minutes.',
      type: WorkItemType.PAYMENT_INVESTIGATION,
      status: Status.OPEN,
      priority: Priority.URGENT,
      version: 1,
      assignedTeamId: complianceTeam.id,
      assignedToId: complianceLead.id,
      createdById: adminUser.id,
      tags: ['fraud', 'risk', 'security'],
    },
  });

  await prisma.activityLog.create({
    data: {
      workItemId: item3.id,
      actorId: adminUser.id,
      action: 'CREATED',
      details: { initialStatus: 'OPEN', priority: 'URGENT' },
    },
  });

  const item4 = await prisma.workItem.create({
    data: {
      title: 'Customer complaint regarding delayed shipment #88492',
      description: 'User reported order trapped in logistics warehouse status for >7 days.',
      type: WorkItemType.CUSTOMER_ISSUE,
      status: Status.RESOLVED,
      priority: Priority.MEDIUM,
      version: 2,
      assignedTeamId: supportTeam.id,
      assignedToId: supportAgent.id,
      createdById: supportAgent.id,
      tags: ['shipping', 'logistics'],
    },
  });

  await prisma.activityLog.create({
    data: {
      workItemId: item4.id,
      actorId: supportAgent.id,
      action: 'RESOLVED',
      details: { oldStatus: 'IN_PROGRESS', newStatus: 'RESOLVED', note: 'Replacement package expedited via express delivery.' },
    },
  });

  console.log('Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
