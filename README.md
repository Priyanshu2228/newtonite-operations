# Newtonite Operations

Newtonite Operations is an internal operational work coordination application replacing fragmented operational work across chat, spreadsheets, email, and direct conversations with structured work items, ownership, workflow, activity history, team updates, and controlled access.

## Overview

This application centralizes operational tasks into a single platform where teams can manage their work queue, collaborate, and track progress. It prevents work from falling through the cracks by providing clear visibility into ownership and status, while enforcing strict data integrity through optimistic concurrency and atomic claims.

## Key capabilities

- Work item creation and management
- Assignment and atomic claiming
- Status/workflow management
- Due dates and next actions
- Team scoped RBAC
- Optimistic concurrency
- Idempotent mutations
- Activity history
- Comments
- Team updates
- Search/filtering
- Server-side pagination
- Operational Needs Attention ordering

## Tech Stack

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Lucide Icons
- Prisma ORM
- PostgreSQL
- Zod
- Vitest

## Architecture

The application is built as a modular monolith:

frontend
→ REST API
→ services/repositories/domain
→ PostgreSQL

## Prerequisites

- Node v20.x
- Docker Desktop
- PostgreSQL (provided via Docker Compose)

## Setup

```bash
npm install
docker compose up -d
npx prisma migrate deploy
npm run seed
```

## Development

```bash
npm run dev
```

Then visit:
http://localhost:3000

## Production

```bash
npm run build
npm start
```

## Tests

```bash
npx vitest run
```
Latest verified test count: 23 tests passing.

## Demo personas

The application features a demo persona switcher for testing different roles and permissions.

| Persona Name | Global Role | Team & Team Role |
|---|---|---|
| Alex (Admin) | ADMIN | N/A (Global Access) |
| Jordan (Finance Lead) | USER | Finance (LEAD) |
| Sam (Finance Member) | USER | Finance (MEMBER) |
| Riley (Finance Member) | USER | Finance (MEMBER) |
| Morgan (Eng. Member) | USER | Engineering (MEMBER), Operations (MEMBER) |
| Casey (Eng. Viewer) | USER | Engineering (VIEWER) |

Evaluator identity switching works by passing the `X-User-Id` HTTP header in requests. The frontend includes a persona switcher dropdown in the header when `NEXT_PUBLIC_DEMO_PERSONAS=true` is set.

## Demo flow

1. **Dashboard / Needs Attention**: Sign in as an Admin. View the dashboard for organizational metrics and the Needs Attention queues.
2. **Work Queue**: Navigate to Work Items. Observe the server-side pagination and Needs Attention ordering.
3. **Open a work item**: Click a work item to view its details.
4. **Claim or assign work**: Use the claim button or assignee dropdown to assign a work item.
5. **Change state / next action**: Update the status or next action of the work item.
6. **Activity/comments**: Post a comment and observe the append-only activity history log.
7. **Switch persona to demonstrate RBAC**: Switch to a Viewer persona (e.g., Casey) and observe that mutation actions are disabled.
8. **Teams / People / Team Updates**: Navigate to the Teams page to view team compositions, active work, and post team updates.

## Engineering highlights

- **Atomic claim**: Work items are assigned using conditional updates (`WHERE assigneeId IS NULL`) to prevent concurrent claim races.
- **Optimistic concurrency**: Mutating requests validate a `version` attribute to prevent overwriting concurrent edits.
- **Idempotency**: All mutating endpoints support `X-Idempotency-Key` to safely handle network retries and double-clicks.
- **Resource-level authorization**: Service-layer checks ensure users can only access or mutate resources they are permitted to.
- **Server-side pagination/filtering/sorting**: Robust SQL implementation for complex sorts like Needs Attention.
- **Append-only activity/history**: Immutable activity logs for tracking work item lifecycle.

## Known limitations

- Development/evaluator authentication uses `X-User-Id` rather than production SSO.
- No real-time WebSocket layer for live updates.
- Search is currently PostgreSQL `ILIKE` and could use specialized indexing (e.g., pg_trgm or Elasticsearch) at a much larger scale.
