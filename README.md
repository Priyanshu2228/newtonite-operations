# Newtonite — Operational Work Management System

Newtonite is a modern internal operations application built for managing operational work items, compliance investigations, incidents, and approvals across organization teams under high concurrency and strict data integrity constraints.

---

## Technology Stack & Versions

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.x
- **UI & Styling**: React 18, Tailwind CSS 3.4, Lucide Icons, custom shadcn-compatible primitives
- **State Management**: TanStack Query v5 (`@tanstack/react-query`)
- **Database & ORM**: PostgreSQL 16, Prisma 6 ORM (`@prisma/client` & `prisma` 6.19.3)
- **Validation**: Zod
- **Testing**: Vitest 1.6
- **Containerization**: Docker & Docker Compose

---

## Architecture Overview

Newtonite is designed as a **Modular Monolith**:

```text
HTTP Request
  └─► Next.js App Router API Handler (force-dynamic)
        └─► Auth Context (X-User-Id dev authentication)
              └─► Zod Request Validation
                    └─► Domain Authorization & Business Rules
                          └─► Service Layer (WorkItem / Idempotency / Query)
                                └─► Repository Layer (WorkItemRepository / Prisma)
                                      └─► PostgreSQL Database
```

### Key Technical Concepts

1. **Team-Scoped RBAC**: System roles (`ADMIN`, `USER`) and team roles (`LEAD`, `MEMBER`, `VIEWER`). Viewers cannot mutate or be assigned work items; Members can only mutate items assigned to them or within their permissions; Leads & Admins hold broader team management rights.
2. **Optimistic Concurrency Control (OCC)**: Every `WorkItem` maintains a `version` attribute. Mutating requests evaluate `WHERE id = :id AND version = :version`. If concurrent edits occur, the server returns `409 STALE_VERSION`, prompting the client to reload without losing unsaved drafts.
3. **Atomic Claim**: Unassigned work items can be claimed atomically via conditional updates (`WHERE id = :id AND assignee_id IS NULL AND status != 'CLOSED'`). Losing concurrent claims trigger a fresh read to return explicit error responses (`409 ALREADY_ASSIGNED` or `422 CLAIM_NOT_ALLOWED_FOR_STATUS`).
4. **Request Idempotency**: Mutating endpoints support an optional `X-Idempotency-Key` header. Requests check for completed execution before validation to safely replay responses. Key reservations take place within database transactions, and hash mismatches trigger `409 IDEMPOTENCY_KEY_REUSE`.
5. **Deterministic Pagination**: Offset pagination (`items`, `total`, `totalPages`, `page`, `limit`) with secondary `id` sorting for work items. Base64url cursor pagination with tiebreakers `(createdAt, id)` for append-only `Activity` logs.

---

## Prerequisites

- **Node.js**: `v20.x` (or managed via `.nvmrc`)
- **npm**: `v10.x`
- **Docker**: Docker Desktop / Docker Engine (for local PostgreSQL instance)

---

## Environment Configuration

Create a `.env` file in the root directory (matching `.env.example`):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/newtonite"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5433/newtonite_test"
NEXT_PUBLIC_DEMO_PERSONAS=true
```

---

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start PostgreSQL Container**:
   ```bash
   docker compose up -d
   ```
   *Note: PostgreSQL runs on port `5433` to prevent conflicts with default local PostgreSQL services.*

3. **Run Prisma Database Migrations**:
   ```bash
   npx prisma migrate deploy
   ```

4. **Seed Database**:
   ```bash
   npm run seed
   ```

---

## Development & Production Commands

- **Development Server**:
  ```bash
  npm run dev
  ```
  Open [http://localhost:3000](http://localhost:3000) to access the application.

- **TypeScript Type Check**:
  ```bash
  npx tsc --noEmit
  ```

- **Run Integration Tests**:
  ```bash
  npx vitest run
  ```
  *Note: All integration tests run against the real PostgreSQL test database (`newtonite_test`). Safety checks verify that the test database is isolated before applying migrations or test fixtures.*

- **Production Build**:
  ```bash
  npm run build
  ```

- **Start Production Server**:
  ```bash
  npm run start
  ```

---

## Development Authentication & Personas

For development and testing, requests authenticate via the `X-User-Id` HTTP header. When `NEXT_PUBLIC_DEMO_PERSONAS=true`, the UI header displays a persona switcher allowing seamless identity switching:

| Persona Name | Fixed UUID | Global Role | Team & Team Role |
|---|---|---|---|
| Alex (Admin) | `00000000-0000-4000-a000-000000000001` | ADMIN | N/A (Global Access) |
| Jordan (Finance Lead) | `00000000-0000-4000-a000-000000000002` | USER | Finance (LEAD) |
| Sam (Finance Member) | `00000000-0000-4000-a000-000000000003` | USER | Finance (MEMBER) |
| Riley (Finance Member) | `00000000-0000-4000-a000-000000000004` | USER | Finance (MEMBER) |
| Morgan (Eng. Member) | `00000000-0000-4000-a000-000000000005` | USER | Engineering (MEMBER), Operations (MEMBER) |
| Casey (Eng. Viewer) | `00000000-0000-4000-a000-000000000006` | USER | Engineering (VIEWER) |

---

## Evaluator Demo Flow

To see the strongest challenge behaviors, try this flow:
1. **Explore the Dashboard as Admin**: Sign in as "Alex (Admin)". View the organizational summary, Needs Attention queues, and recent activity. Notice global access to all teams.
2. **Needs Attention Sort**: Navigate to the Work Queue and sort by "Needs Attention". The list uses a fully server-side parameterized PostgreSQL SQL implementation (BLOCKED > IN_PROGRESS > OPEN > RESOLVED > CLOSED, then overdue, then priority).
3. **Atomic Claim & Concurrency (OCC)**: Open an unassigned Work Item and "Claim" it. The server guarantees atomic claim (`assigneeId IS NULL`). Try updating the item title in one tab, then attempt to change status in a duplicate tab. The stale update is rejected with `409 STALE_VERSION`.
4. **RBAC Validation**: Switch persona to "Casey (Eng. Viewer)". Notice the UI adapts: you cannot edit, claim, or add comments, and the Admin panel is inaccessible.
5. **Idempotency**: All mutating endpoints support `X-Idempotency-Key`. Double-clicks or replays of identical requests safely return the cached success response.
6. **People Management**: Switch back to Admin, navigate to "People", and try adding a new User and Team Membership through the modal. The system validates and applies changes using actual database mutations.

## REST API Summary

- `GET /api/teams` — Scoped teams listing
- `GET /api/teams/:teamId/members` — Team members for assignment
- `GET /api/work-items` — Work queue listing with search, filtering, and pagination
- `POST /api/work-items` — Create work item (Idempotency supported)
- `GET /api/work-items/:id` — Detail view with RBAC read enforcement
- `PATCH /api/work-items/:id` — OCC partial update (Idempotency supported)
- `POST /api/work-items/:id/claim` — Atomic claim action (Idempotency supported)
- `GET /api/work-items/:id/activity` — Cursor-paginated activity feed
