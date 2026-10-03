import { PrismaClient, GlobalRole, TeamRole, Category, Priority, Status, ActivityAction } from "@prisma/client";
import { PERSONAS } from "./personas";

export async function seed(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error("seed(databaseUrl) requires an explicit databaseUrl");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    // Clean existing data in reverse dependency order
    await prisma.activity.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.teamUpdate.deleteMany();
    await prisma.workItem.deleteMany();
    await prisma.teamMember.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();

    // 1. Create Users using deterministic PERSONAS
    const admin = await prisma.user.create({
      data: {
        id: PERSONAS.ADMIN.id,
        name: PERSONAS.ADMIN.name,
        email: PERSONAS.ADMIN.email,
        globalRole: GlobalRole.ADMIN,
      },
    });

    const finLead = await prisma.user.create({
      data: {
        id: PERSONAS.FINANCE_LEAD.id,
        name: PERSONAS.FINANCE_LEAD.name,
        email: PERSONAS.FINANCE_LEAD.email,
        globalRole: GlobalRole.USER,
      },
    });

    const finMember1 = await prisma.user.create({
      data: {
        id: PERSONAS.FINANCE_MEMBER_1.id,
        name: PERSONAS.FINANCE_MEMBER_1.name,
        email: PERSONAS.FINANCE_MEMBER_1.email,
        globalRole: GlobalRole.USER,
      },
    });

    const finMember2 = await prisma.user.create({
      data: {
        id: PERSONAS.FINANCE_MEMBER_2.id,
        name: PERSONAS.FINANCE_MEMBER_2.name,
        email: PERSONAS.FINANCE_MEMBER_2.email,
        globalRole: GlobalRole.USER,
      },
    });

    const engMember = await prisma.user.create({
      data: {
        id: PERSONAS.ENGINEERING_MEMBER.id,
        name: PERSONAS.ENGINEERING_MEMBER.name,
        email: PERSONAS.ENGINEERING_MEMBER.email,
        globalRole: GlobalRole.USER,
      },
    });

    const engViewer = await prisma.user.create({
      data: {
        id: PERSONAS.ENGINEERING_VIEWER.id,
        name: PERSONAS.ENGINEERING_VIEWER.name,
        email: PERSONAS.ENGINEERING_VIEWER.email,
        globalRole: GlobalRole.USER,
      },
    });

    // 2. Create Teams
    const financeTeam = await prisma.team.create({
      data: {
        name: "Finance",
        description: "Financial operations, payment investigations, and compliance approvals",
      },
    });

    const engTeam = await prisma.team.create({
      data: {
        name: "Engineering",
        description: "Core technical infrastructure and software engineering incidents",
      },
    });

    const opsTeam = await prisma.team.create({
      data: {
        name: "Operations",
        description: "Day-to-day operational execution and logistics",
      },
    });

    // 3. Create Team Memberships
    await prisma.teamMember.createMany({
      data: [
        { userId: finLead.id, teamId: financeTeam.id, teamRole: TeamRole.LEAD },
        { userId: finMember1.id, teamId: financeTeam.id, teamRole: TeamRole.MEMBER },
        { userId: finMember2.id, teamId: financeTeam.id, teamRole: TeamRole.MEMBER },
        { userId: engMember.id, teamId: engTeam.id, teamRole: TeamRole.MEMBER },
        { userId: engViewer.id, teamId: engTeam.id, teamRole: TeamRole.VIEWER },
        { userId: engMember.id, teamId: opsTeam.id, teamRole: TeamRole.MEMBER },
      ],
    });

    // Helper for dates
    const now = Date.now();
    const pastDate = (daysAgo: number) => new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const futureDate = (daysAhead: number) => new Date(now + daysAhead * 24 * 60 * 60 * 1000);

    // 4. Create WorkItems (35+ total)
    // 4a. Finance Team Items (12 items; at least 5 unassigned OPEN)
    const financeItemsData = [
      // 5 Unassigned OPEN items
      { title: "Investigate Unmatched Wire Transfer #4092", description: "Incoming SWIFT transfer of $45,000 pending match with ledger account.", category: Category.PAYMENT_INVESTIGATION, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: futureDate(2), nextAction: "Verify account number with receiving bank" },
      { title: "Quarterly Tax Compliance Review", description: "Audit Q3 tax filings for regional entity compliance.", category: Category.COMPLIANCE, priority: Priority.CRITICAL, status: Status.OPEN, assigneeId: null, dueAt: pastDate(1), nextAction: "Gather signed tax schedules" }, // Overdue
      { title: "Vendor Payment Approval - Cloud Hosting", description: "Monthly AWS invoice breakdown exceeds budget threshold ($12,400).", category: Category.APPROVAL, priority: Priority.MEDIUM, status: Status.OPEN, assigneeId: null, dueAt: futureDate(5), nextAction: "Request line-item cost report" },
      { title: "Chargeback Dispute #8831", description: "Merchant customer disputed transaction $1,250 due to suspected unauthorized activity.", category: Category.PAYMENT_INVESTIGATION, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: pastDate(3), nextAction: "Submit proof of delivery to gateway" }, // Overdue
      { title: "Annual Audit Preparation - Ledger Reconciliation", description: "Reconcile balance sheet accounts ahead of internal audit team review.", category: Category.OPERATIONAL_TASK, priority: Priority.LOW, status: Status.OPEN, assigneeId: null, dueAt: futureDate(14), nextAction: "Export trial balance" },

      // Assigned & other status items
      { title: "Duplicate Payout Settlement Check", description: "System flagged potential duplicate payout batch execution.", category: Category.INCIDENT, priority: Priority.CRITICAL, status: Status.IN_PROGRESS, assigneeId: finLead.id, dueAt: futureDate(1), nextAction: "Cross-reference gateway transaction IDs" },
      { title: "KYC Verification Backlog Clearance", description: "Review 15 high-risk enterprise account KYC verification submissions.", category: Category.COMPLIANCE, priority: Priority.HIGH, status: Status.IN_PROGRESS, assigneeId: finMember1.id, dueAt: pastDate(2), nextAction: "Verify beneficial ownership documents" },
      { title: "Payroll Variance Analysis", description: "Analyze 5% variance in month-over-month contractor payroll.", category: Category.PAYMENT_INVESTIGATION, priority: Priority.MEDIUM, status: Status.BLOCKED, assigneeId: finMember2.id, dueAt: futureDate(3), nextAction: "Awaiting contractor timecard submission" },
      { title: "Corporate Credit Line Renewal", description: "Prepare liquidity documentation for annual credit limit renewal.", category: Category.APPROVAL, priority: Priority.HIGH, status: Status.RESOLVED, assigneeId: finLead.id, dueAt: pastDate(5), nextAction: "Archive signed renewal agreement" },
      { title: "Expense Policy Update Q3", description: "Publish updated travel expense submission policy guidelines.", category: Category.OPERATIONAL_TASK, priority: Priority.LOW, status: Status.CLOSED, assigneeId: finMember1.id, dueAt: pastDate(10), nextAction: "Policy finalized" },
      { title: "International FX Fee Audit", description: "Verify cross-border transaction fees against bank service agreement rate card.", category: Category.COMPLIANCE, priority: Priority.MEDIUM, status: Status.IN_PROGRESS, assigneeId: finMember2.id, dueAt: futureDate(4), nextAction: "Calculate effective bps margin" },
      { title: "Unallocated Ledger Balance Cleanup", description: "Reclassify unassigned clearing account line items from last fiscal quarter.", category: Category.PAYMENT_INVESTIGATION, priority: Priority.LOW, status: Status.OPEN, assigneeId: finMember1.id, dueAt: futureDate(7), nextAction: "Post manual journal entry" },
    ];

    const createdFinanceItems = [];
    for (const item of financeItemsData) {
      const created = await prisma.workItem.create({
        data: {
          ...item,
          teamId: financeTeam.id,
          createdById: admin.id,
        },
      });
      createdFinanceItems.push(created);
    }

    // 4b. Engineering Team Items (12 items; at least 5 unassigned OPEN)
    const engItemsData = [
      // 5 Unassigned OPEN items
      { title: "Database High CPU Utilization Spike", description: "Primary RDS PostgreSQL instance reaching 95% CPU during peak batch load.", category: Category.INCIDENT, priority: Priority.CRITICAL, status: Status.OPEN, assigneeId: null, dueAt: pastDate(1), nextAction: "Analyze slow query log and active connections" }, // Overdue
      { title: "API Gateway Rate Limiter Leak", description: "Redis rate limiter token bucket leaking under burst traffic.", category: Category.INCIDENT, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: futureDate(2), nextAction: "Inspect sliding window implementation" },
      { title: "SSL Certificate Expiration Warning", description: "Wildcard TLS certificate for internal endpoints expires in 10 days.", category: Category.OPERATIONAL_TASK, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: futureDate(3), nextAction: "Renew Cert-Manager Let's Encrypt ingress" },
      { title: "CI/CD Pipeline Build Intermittent Failures", description: "Flaky integration tests causing pipeline re-runs in web service repo.", category: Category.OPERATIONAL_TASK, priority: Priority.MEDIUM, status: Status.OPEN, assigneeId: null, dueAt: futureDate(6), nextAction: "Isolate network timeout in container runner" },
      { title: "Security Vulnerability Patching - Node v20", description: "Apply security patch release Node v20.20.2 across microservice images.", category: Category.COMPLIANCE, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: pastDate(2), nextAction: "Rebuild base Dockerfiles" }, // Overdue

      // Assigned & other status items
      { title: "Kafka Consumer Lag Breakdown", description: "Event stream processing pipeline lagging behind payment event producer by 45m.", category: Category.INCIDENT, priority: Priority.CRITICAL, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: futureDate(1), nextAction: "Scale consumer group partition count" },
      { title: "Database Migration Script Optimization", description: "Add missing composite indexes on WorkItem teamId and status columns.", category: Category.OPERATIONAL_TASK, priority: Priority.MEDIUM, status: Status.RESOLVED, assigneeId: engMember.id, dueAt: pastDate(3), nextAction: "Verify query execution plan in production" },
      { title: "OAuth Token Expiry Session Drop", description: "Users experiencing forced logouts every 15 minutes due to refresh race.", category: Category.INCIDENT, priority: Priority.HIGH, status: Status.BLOCKED, assigneeId: engMember.id, dueAt: futureDate(2), nextAction: "Awaiting auth service architecture signoff" },
      { title: "Storage Volume Capacity Warning", description: "Log aggregator disk utilization above 85% on node cluster.", category: Category.OPERATIONAL_TASK, priority: Priority.MEDIUM, status: Status.CLOSED, assigneeId: engMember.id, dueAt: pastDate(7), nextAction: "Log retention policy adjusted" },
      { title: "Third-party Payment Webhook Failures", description: "Stripe webhook endpoint returning HTTP 502 Bad Gateway under load.", category: Category.PAYMENT_INVESTIGATION, priority: Priority.HIGH, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: pastDate(1), nextAction: "Inspect load balancer proxy timeouts" },
      { title: "Deprecate Legacy Auth Header Support", description: "Sunset v1 bearer authorization header processing in public API routing layer.", category: Category.COMPLIANCE, priority: Priority.LOW, status: Status.OPEN, assigneeId: engMember.id, dueAt: futureDate(10), nextAction: "Review client deprecation metrics" },
      { title: "Memory Leak in Background Poller", description: "Heap memory usage steadily increasing over 72h period in worker pods.", category: Category.INCIDENT, priority: Priority.HIGH, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: futureDate(1), nextAction: "Take heap snapshot after 24h run" },
    ];

    const createdEngItems = [];
    for (const item of engItemsData) {
      const created = await prisma.workItem.create({
        data: {
          ...item,
          teamId: engTeam.id,
          createdById: admin.id,
        },
      });
      createdEngItems.push(created);
    }

    // 4c. Operations Team Items (11 items; at least 5 unassigned OPEN)
    const opsItemsData = [
      // 5 Unassigned OPEN items
      { title: "Hardware Procurement Request - Dev Workstations", description: "Approve purchase of 3 replacement laptops for infrastructure engineers.", category: Category.APPROVAL, priority: Priority.MEDIUM, status: Status.OPEN, assigneeId: null, dueAt: futureDate(5), nextAction: "Review manager approval signatures" },
      { title: "Data Center Maintenance Schedule", description: "Coordinate quarterly power maintenance window with hosting provider.", category: Category.OPERATIONAL_TASK, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: futureDate(8), nextAction: "Publish maintenance window notice" },
      { title: "Vendor SLA Compliance Check - ISP", description: "Review monthly uptime SLA logs from primary bandwidth provider.", category: Category.COMPLIANCE, priority: Priority.LOW, status: Status.OPEN, assigneeId: null, dueAt: futureDate(12), nextAction: "Calculate uptime percentage" },
      { title: "Disaster Recovery Runbook Exercise", description: "Schedule bi-annual failover drill for core database clusters.", category: Category.OPERATIONAL_TASK, priority: Priority.HIGH, status: Status.OPEN, assigneeId: null, dueAt: pastDate(2), nextAction: "Set up secondary environment staging" }, // Overdue
      { title: "Access Control Perms Audit", description: "Verify active employee system access list against HR termination logs.", category: Category.COMPLIANCE, priority: Priority.CRITICAL, status: Status.OPEN, assigneeId: null, dueAt: pastDate(1), nextAction: "Revoke stale VPN certificates" }, // Overdue

      // Assigned & other status items
      { title: "Office Network Security Upgrade", description: "Deploy WPA3 enterprise encryption across HQ access points.", category: Category.OPERATIONAL_TASK, priority: Priority.MEDIUM, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: futureDate(3), nextAction: "Reconfigure RADIUS server" },
      { title: "Onboarding Access Grant - New Hire", description: "Grant GitHub, Slack, and Jira permissions to incoming Finance Specialist.", category: Category.OPERATIONAL_TASK, priority: Priority.LOW, status: Status.RESOLVED, assigneeId: engMember.id, dueAt: pastDate(4), nextAction: "Confirm user login" },
      { title: "Backup Storage Media Retention Policy", description: "Audit offline tape backup rotation and offsite storage logs.", category: Category.COMPLIANCE, priority: Priority.LOW, status: Status.CLOSED, assigneeId: engMember.id, dueAt: pastDate(15), nextAction: "Audit completed" },
      { title: "Facilities Cooling Unit Inspection", description: "Server room AC unit 2 reporting temperature differential alert.", category: Category.INCIDENT, priority: Priority.HIGH, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: futureDate(1), nextAction: "Dispatch HVAC technician" },
      { title: "Third-party Security Assessment Approval", description: "Sign NDA and approve penetration testing scope for annual SOC2 audit.", category: Category.APPROVAL, priority: Priority.HIGH, status: Status.OPEN, assigneeId: engMember.id, dueAt: futureDate(4), nextAction: "Review penetration test rules of engagement" },
      { title: "Emergency Power Generator Test", description: "Monthly automated load test of backup diesel generator.", category: Category.OPERATIONAL_TASK, priority: Priority.MEDIUM, status: Status.IN_PROGRESS, assigneeId: engMember.id, dueAt: futureDate(2), nextAction: "Monitor fuel transfer pumps" },
    ];

    for (const item of opsItemsData) {
      await prisma.workItem.create({
        data: {
          ...item,
          teamId: opsTeam.id,
          createdById: admin.id,
        },
      });
    }

    // 5. Create Activity History
    // Create CREATED activity for all work items
    const allWorkItems = await prisma.workItem.findMany();
    for (const wi of allWorkItems) {
      await prisma.activity.create({
        data: {
          workItemId: wi.id,
          actorId: admin.id,
          action: ActivityAction.CREATED,
          details: { title: wi.title, category: wi.category },
          createdAt: wi.createdAt,
        },
      });
    }

    // IMPORTANT: Seed at least 100 Activity records on ONE WorkItem (Target: createdFinanceItems[0])
    const targetItem = createdFinanceItems[0];
    const baseTime = pastDate(30).getTime();
    
    // We will create 105 total activities for targetItem
    // Including deliberate GROUPS with IDENTICAL createdAt timestamps!
    const activityBatch: Array<{
      workItemId: string;
      actorId: string;
      action: ActivityAction;
      details: any;
      createdAt: Date;
    }> = [];

    // Create 15 timestamp groups. Group 0: 10 items sharing timestamp T0. Group 1: 10 items sharing T1...
    const actors = [admin.id, finLead.id, finMember1.id, finMember2.id];
    const actions = [
      ActivityAction.UPDATED,
      ActivityAction.STATUS_CHANGED,
      ActivityAction.PRIORITY_CHANGED,
      ActivityAction.ASSIGNED,
      ActivityAction.UNASSIGNED,
    ];

    let timestampIndex = 0;
    for (let g = 0; g < 15; g++) {
      // Shared timestamp for all items in group g
      const sharedTimestamp = new Date(baseTime + g * 3600 * 1000 * 4); // 4 hours apart per group
      const itemsInGroup = g < 5 ? 10 : 7; // creates ~105 total

      for (let i = 0; i < itemsInGroup; i++) {
        const actorId = actors[(g + i) % actors.length];
        const action = actions[(g * 3 + i) % actions.length];
        let details: any = { group: g, index: i, note: `Audit event log step ${g}-${i}` };

        if (action === ActivityAction.STATUS_CHANGED) {
          details = { ...details, from: "OPEN", to: "IN_PROGRESS" };
        } else if (action === ActivityAction.PRIORITY_CHANGED) {
          details = { ...details, from: "MEDIUM", to: "HIGH" };
        } else if (action === ActivityAction.ASSIGNED) {
          details = { ...details, from: null, to: actorId, via: "claim" };
        } else if (action === ActivityAction.UNASSIGNED) {
          details = { ...details, from: actorId, to: null };
        }

        activityBatch.push({
          workItemId: targetItem.id,
          actorId,
          action,
          details,
          createdAt: sharedTimestamp, // EXACT SHARED TIMESTAMP for tiebreaker testing!
        });
      }
    }

    // Insert all activity records sequentially to ensure deterministic execution
    for (const act of activityBatch) {
      await prisma.activity.create({ data: act });
    }

    // 6. Create Team Updates
    await prisma.teamUpdate.createMany({
      data: [
        {
          teamId: engTeam.id,
          authorId: engMember.id,
          content: "Deployment completed. Monitoring error rates before closing the incident.",
          createdAt: pastDate(0.1),
        },
        {
          teamId: financeTeam.id,
          authorId: finLead.id,
          content: "Settlement file received. Reconciliation is in progress.",
          createdAt: pastDate(0.2),
        },
        {
          teamId: opsTeam.id,
          authorId: admin.id,
          content: "HVAC inspection has been handed over to Facilities.",
          createdAt: pastDate(0.5),
        },
      ],
    });

    console.log(`[Seed Success] Database seeded with:
- 6 Users (${Object.keys(PERSONAS).join(", ")})
- 3 Teams (Finance, Engineering, Operations)
- 6 TeamMemberships
- ${allWorkItems.length} WorkItems (Finance: ${financeItemsData.length}, Eng: ${engItemsData.length}, Ops: ${opsItemsData.length})
- 3 Team Updates
- ${activityBatch.length + allWorkItems.length} Total Activity records (${activityBatch.length} on item ${targetItem.id})`);

  } finally {
    await prisma.$disconnect();
  }
}
