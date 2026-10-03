# Newtonite Software Engineering Challenge

## Operations Under Pressure — Complete Implementation Specification

You are an autonomous senior full stack engineer.

Your job is to BUILD the complete working application described below from scratch.

Do not merely explain the architecture.
Do not generate a partial prototype.
Do not stop after scaffolding.

Implement the complete application including:

• database
• Prisma schema
• migrations
• seed data
• REST API
• authorization
• concurrency correctness
• idempotency
• Activity history
• server side search
• server side filtering
• pagination
• frontend
• frontend state management
• error handling
• automated tests
• Docker setup
• documentation

The application must be runnable locally.

Use this workflow throughout:

IMPLEMENT → TEST → FIX → VERIFY

After every major phase:

1. Run `npx tsc --noEmit`
2. Run `npx vitest run`
3. Fix failures before continuing.
4. Update `PROGRESS.md`.
5. Commit the completed phase to git.

Before each major phase, reread the relevant sections of this specification and `PROGRESS.md`.

If the session is interrupted, resume from `PROGRESS.md` and inspect the existing implementation before changing anything.

Do not ask routine implementation questions.

Make reasonable engineering decisions that are consistent with this specification.

Do not silently remove, weaken, simplify, or reinterpret any requirement in this specification.

---

# 1. PRODUCT GOAL

Build an internal operations work management system called Newtonite.

This is NOT intended to be a Jira or Trello clone.

The product should feel like an internal operations tool where teams manage operational work under pressure.

The system must make it easy to understand:

• What needs to be done
• Why it matters
• Current state
• Importance
• Responsible person
• What happened previously
• What needs attention next

The system must support multiple teams and roles.

The important engineering problems are:

• authorization
• concurrency
• stale edits
• duplicate requests
• server side filtering
• pagination
• scalable data access
• audit/history
• frontend state consistency
• error handling
• maintainability

Prioritize correctness over unnecessary feature breadth.

---

# 2. REQUIRED STACK

Use exactly this stack unless a compatibility issue makes an equivalent implementation unavoidable.

Frontend and backend:

• Next.js 14.x
• React 18
• TypeScript
• Next.js App Router
• REST API routes under `/app/api/*`

Database:

• PostgreSQL
• Prisma 6.x

UI:

• Tailwind CSS 3.4.x
• shadcn/ui
• Lucide icons

Validation:

• Zod

Server state:

• TanStack Query v5

Testing:

• Vitest

Architecture:

• Single repository
• Modular monolith

Recommended structure:

src/
services/
repositories/
auth/
domain/
validation/
lib/
components/

Do NOT use:

• Server Actions
• GraphQL
• WebSockets
• Redis
• Kafka
• microservices
• Kubernetes
• background workers

Do not introduce infrastructure that is not required by this assignment.

---

# 3. VERSION COMPATIBILITY

The application must remain compatible with:

• Node 20
• Next.js 14
• React 18
• Tailwind 3.4
• Prisma 6

Create:

`.nvmrc`

containing:

```text
20
```

For shadcn/ui:

The implementation MUST remain compatible with Next.js 14, React 18 and Tailwind 3.4.

If the current shadcn CLI attempts to upgrade the project to Tailwind 4 or React 19:

DO NOT upgrade the stack.

Use a compatible older CLI or manually implement the required shadcn compatible components.

At minimum provide compatible:

• Button
• Input
• Select
• Badge
• Card
• Dialog

---

# 4. PROJECT INITIALIZATION

Start by creating the project from scratch.

Initialize git:

```bash
git init
```

Create:

• package.json
• tsconfig.json
• next.config.js
• .nvmrc
• .env.example
• docker-compose.yml
• README.md
• PROGRESS.md
• ENGINEERING_DECISIONS.md

Do not commit secrets.

---

# 5. ENVIRONMENT

Use:

`DATABASE_URL`

for development.

Use:

`DATABASE_URL_TEST`

for automated tests.

Example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/newtonite"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/newtonite_test"
NEXT_PUBLIC_DEMO_PERSONAS=true
```

The default demo persona should be Admin.

---

# 6. DATABASE

Use PostgreSQL with Prisma.

Create the following schema:

```prisma
enum GlobalRole {
  ADMIN
  USER
}

enum TeamRole {
  LEAD
  MEMBER
  VIEWER
}

enum Category {
  INCIDENT
  COMPLIANCE
  PAYMENT_INVESTIGATION
  APPROVAL
  OPERATIONAL_TASK
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum Status {
  OPEN
  IN_PROGRESS
  BLOCKED
  RESOLVED
  CLOSED
}

enum ActivityAction {
  CREATED
  UPDATED
  STATUS_CHANGED
  ASSIGNED
  UNASSIGNED
  PRIORITY_CHANGED
}

model User {
  id                String       @id @default(uuid())
  name              String
  email             String       @unique
  globalRole        GlobalRole   @default(USER)
  memberships       TeamMember[]
  createdWorkItems  WorkItem[]   @relation("CreatedBy")
  assignedWorkItems WorkItem[]   @relation("AssignedTo")
  activities        Activity[]
  createdAt         DateTime     @default(now())
}

model Team {
  id          String       @id @default(uuid())
  name        String       @unique
  description String?
  members     TeamMember[]
  workItems   WorkItem[]
  createdAt   DateTime     @default(now())
}

model TeamMember {
  id       String   @id @default(uuid())
  userId   String
  teamId   String
  teamRole TeamRole @default(MEMBER)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  team     Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([userId, teamId])
  @@index([userId])
}

model WorkItem {
  id          String     @id @default(uuid())
  title       String
  description String
  category    Category
  priority    Priority   @default(MEDIUM)
  status      Status     @default(OPEN)

  teamId      String
  team        Team       @relation(fields: [teamId], references: [id])

  createdById String
  createdBy   User       @relation("CreatedBy", fields: [createdById], references: [id])

  assigneeId  String?
  assignee    User?      @relation("AssignedTo", fields: [assigneeId], references: [id])

  nextAction  String?
  dueAt       DateTime?

  version     Int        @default(1)

  activities  Activity[]

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([teamId, status, priority, updatedAt, id])
  @@index([teamId, updatedAt, id])
  @@index([assigneeId, status])
  @@index([createdAt])
}

model Activity {
  id         String         @id @default(uuid())
  workItemId String
  workItem   WorkItem      @relation(fields: [workItemId], references: [id])

  actorId    String
  actor      User           @relation(fields: [actorId], references: [id])

  action     ActivityAction
  details    Json?

  createdAt  DateTime       @default(now())

  @@index([workItemId, createdAt, id])
}

model IdempotencyRecord {
  id           String   @id @default(uuid())
  userId       String
  operation    String
  key          String
  requestHash  String
  statusCode   Int?
  responseBody Json?
  createdAt    DateTime @default(now())

  @@unique([userId, operation, key])
}
```

---

# 7. CORE DATA INVARIANTS

These rules must be enforced server side.

## Invariant 1

`WorkItem.teamId` is immutable after creation.

## Invariant 2

Activity records are append only.

There is no Activity update or delete API.

## Invariant 3

There is no WorkItem delete API.

The lifecycle ends at CLOSED.

Only authorized users may reopen CLOSED items.

## Invariant 4

An assignee must:

• be a member of the WorkItem's team
• have TeamRole LEAD or MEMBER

VIEWER cannot be assigned.

## Invariant 5

The client is never trusted for authorization.

The server loads:

• global role
• team memberships
• team roles

from PostgreSQL using the authenticated user ID.

---

# 8. DEVELOPMENT AUTHENTICATION

For this assignment, use a development authentication mechanism.

The client sends:

```text
X-User-Id: <user-id>
```

The server must load the corresponding User and memberships from the database.

Never accept:

• role
• team
• teamRole
• permissions

from the client.

Do not create an unauthenticated users endpoint.

---

# 9. PERSONA DEFINITIONS

Create deterministic persona IDs.

They MUST live in:

```text
src/lib/personas.ts
```

Example structure:

```ts
export const PERSONAS = {
  ADMIN: {
    id: "...",
    name: "Admin",
    email: "admin@newtonite.local"
  },
  ...
}
```

Use these same constants in:

• seed script
• frontend persona switcher

Do not duplicate the UUIDs in multiple places.

Do not generate random persona IDs during every seed.

Do not create a `/api/users` endpoint just for the persona switcher.

The frontend persona switcher must use the deterministic persona definitions.

---

# 10. SEED PERSONAS

Seed these primary users:

• Admin
• Finance Lead
• Finance Member 1
• Finance Member 2
• Engineering Member
• Engineering Viewer

Seed teams:

• Finance
• Engineering
• Operations

Memberships:

```text
Finance Lead       → Finance LEAD
Finance Member 1   → Finance MEMBER
Finance Member 2   → Finance MEMBER
Engineering Member → Engineering MEMBER
Engineering Viewer → Engineering VIEWER
Engineering Member → Operations MEMBER
```

IMPORTANT:

Do NOT add Engineering Member to Finance.

Admin may have no team membership.

---

# 11. SEED DATA

Seed at least 30 WorkItems.

Use varied:

• teams
• statuses
• priorities
• categories
• assignees
• due dates
• next actions

For each team, include at least 5 unassigned OPEN WorkItems.

Seed at least 100 Activity records on one WorkItem.

Activities must have varied timestamps.

IMPORTANT:

Create deliberate equal `createdAt` timestamp groups in the Activity seed.

For example, several Activity records should share exactly the same timestamp.

This is required so cursor pagination can genuinely test the `(createdAt, id)` tiebreaker.

---

# 12. SEED FUNCTION

The seed function must accept an explicit database URL.

For example:

```ts
seed(databaseUrl)
```

The seed function must NOT silently fall back to `DATABASE_URL` when called by tests.

Tests must explicitly call:

```ts
seed(DATABASE_URL_TEST)
```

Do not make global test setup depend on the normal Prisma `db seed` command.

---

# 13. TEST DATABASE SAFETY

Create:

```text
docker-compose.yml
docker/init-test-db.sql
```

The test database should be:

```text
newtonite_test
```

Provide:

```bash
npm run db:test:create
```

as a fallback if an existing Docker volume does not contain the database.

Test setup MUST:

1. Verify `DATABASE_URL_TEST` exists.
2. Verify `DATABASE_URL_TEST !== DATABASE_URL`.
3. Verify the database name contains `test`.
4. Connect directly using `DATABASE_URL_TEST`.
5. Reset/drop/recreate ONLY the public schema of the test database.
6. Run Prisma migrations against `DATABASE_URL_TEST`.
7. Explicitly call `seed(DATABASE_URL_TEST)`.

DO NOT:

• reset the development database
• run normal `prisma db seed` from globalSetup
• allow the seed function to silently use DATABASE_URL
• use an ambiguous reset command that could target the development database

The test database must be isolated from development data.

Use a test connection limit of approximately 20.

---

# 14. AUTHORIZATION MODEL

## Global role

ADMIN:

• can read all teams
• can create in any team
• can update any WorkItem
• can assign users
• can manage across teams

USER:

Authorization comes from TeamMember.

---

# 15. READ AUTHORIZATION

A user may read:

• WorkItems belonging to teams they are a member of

ADMIN may read all.

Lead/Member/Viewer may read only their own teams.

List queries must automatically scope results to authorized team IDs.

A client supplied `teamId` is only a narrowing filter.

It must never expand access.

For a specific WorkItem:

• missing WorkItem → 404
• existing but unauthorized WorkItem → 403

This deliberate 403 versus 404 behavior should be documented as a tradeoff.

---

# 16. CREATE AUTHORIZATION

ADMIN:

Can create in any team.

LEAD:

Can create in teams where they are LEAD.

MEMBER:

Can create in teams where they are MEMBER.

VIEWER:

Cannot create.

Return:

```text
403
```

when unauthorized.

Create must NOT allow client supplied:

• createdById
• version
• arbitrary status
• arbitrary assignee

unless explicitly supported by the API contract.

---

# 17. CLAIM AUTHORIZATION

Claim means assigning the current authenticated user to an unassigned WorkItem.

Allowed:

• LEAD
• MEMBER

of the WorkItem's team.

VIEWER cannot claim.

Non-member cannot claim.

ADMIN may claim only if the Admin is also a member of that team.

ADMIN does not automatically become a valid claimant for every team.

Claim must not change status.

Claim increments version.

Claim is forbidden for CLOSED items.

Return:

```text
422
```

with:

```text
CLAIM_NOT_ALLOWED_FOR_STATUS
```

when the item is CLOSED.

---

# 18. UPDATE AUTHORIZATION

ADMIN:

Can edit all editable fields.

LEAD:

Can edit WorkItems in their own team.

Allowed fields:

• title
• description
• priority
• status
• assignee
• nextAction
• dueAt

MEMBER:

Can edit only WorkItems assigned to themselves.

Members may modify only:

• title
• description
• status

VIEWER:

Read only.

---

# 19. STATUS TRANSITIONS

Only these transitions are valid:

```text
OPEN → IN_PROGRESS
OPEN → RESOLVED

IN_PROGRESS → BLOCKED
IN_PROGRESS → RESOLVED

BLOCKED → IN_PROGRESS

RESOLVED → CLOSED
RESOLVED → IN_PROGRESS

CLOSED → IN_PROGRESS
```

Reopening CLOSED → IN_PROGRESS is allowed only for:

• ADMIN
• LEAD

Invalid transitions must return:

```text
422
```

with:

```text
INVALID_STATUS_TRANSITION
```

Do not allow arbitrary status changes.

---

# 20. PATCH CONTRACT

PATCH WorkItem is partial.

Request MUST contain:

```text
version
```

Allowed fields:

• version
• title
• description
• priority
• status
• assigneeId
• nextAction
• dueAt

Reject unknown/protected fields such as:

• id
• teamId
• createdById

If a protected field is supplied with a different value:

```text
403
```

If it is supplied with the same existing value:

ignore it.

If the request results in no actual changes:

return:

```text
200
```

with the current WorkItem.

For a no-op:

• do NOT increment version
• do NOT create Activity
• DO store the successful result in IdempotencyRecord if the request had an idempotency key

An empty change set without an idempotent replay is:

```text
400
```

---

# 21. OPTIMISTIC CONCURRENCY CONTROL

Every WorkItem has:

```text
version
```

The client must send the version it last read.

Update must be atomic.

Use logic equivalent to:

```ts
updateMany({
  where: {
    id,
    version: expectedVersion
  },
  data: {
    ...changes,
    version: {
      increment: 1
    }
  }
})
```

If zero rows are updated:

return:

```text
409
```

with:

```text
STALE_VERSION
```

Do not perform:

1. SELECT version
2. later UPDATE without version condition

That is race prone.

The version check and update must happen atomically.

Activity creation must occur in the same transaction as the successful mutation.

---

# 22. CONCURRENT CLAIM

Claim must be race safe.

Do not:

1. read whether assignee is null
2. then update later

Use an atomic conditional update equivalent to:

```text
where:
  id = workItemId
  assigneeId IS NULL
  status != CLOSED
```

Only one concurrent claimant may win.

If the conditional update affects zero rows:

perform a fresh read to distinguish:

• missing → 404
• already assigned → 409 ALREADY_ASSIGNED
• CLOSED → 422 CLAIM_NOT_ALLOWED_FOR_STATUS

Do not report all zero row outcomes as the same error.

---

# 23. ACTIVITY HISTORY

Activity is append only.

Creation creates:

```text
CREATED
```

Successful PATCH creates one Activity for each relevant category:

```text
STATUS_CHANGED
PRIORITY_CHANGED
ASSIGNED
UNASSIGNED
UPDATED
```

Examples:

title changed → UPDATED

description changed → UPDATED

nextAction changed → UPDATED

dueAt changed → UPDATED

status changed → STATUS_CHANGED

priority changed → PRIORITY_CHANGED

assignee changed from user A to user B → ASSIGNED

assignee changed from user A to null → UNASSIGNED

Claim creates:

```text
ASSIGNED
```

with details equivalent to:

```json
{
  "from": null,
  "to": "userId",
  "via": "claim"
}
```

All Activity creation must occur in the same database transaction as the WorkItem mutation.

No op PATCH creates no Activity.

---

# 24. IDEMPOTENCY

The following mutation operations require:

```text
X-Idempotency-Key
```

• POST create
• PATCH WorkItem
• POST claim

The key:

• cannot be empty
• maximum 128 characters

Invalid key:

```text
400
```

with:

```text
IDEMPOTENCY_KEY_REQUIRED
```

Scope is:

```text
(userId, operation, key)
```

Therefore:

same user + same operation + same key

is the same idempotency scope.

Different users may independently use the same key.

Different operations may independently use the same key.

---

# 25. REQUEST HASH

Calculate:

```text
SHA-256
```

of the canonical mutation input.

The canonical input must include the resource ID where applicable.

Equivalent requests must produce the same canonical hash.

Different mutation bodies must produce different hashes.

---

# 26. CRITICAL IDEMPOTENCY ORDERING

This order is mandatory.

For a mutation:

1. Authenticate X-User-Id.
2. Validate idempotency header.
3. Validate request shape, field types and UUID formats.
4. Reject unknown/protected fields as appropriate.
5. Calculate requestHash.
6. Look up an existing completed IdempotencyRecord.
7. If a matching record exists:
   • same hash → immediately replay stored status/body
   • add `Idempotent-Replayed: true`
   • DO NOT re-check authorization
   • DO NOT re-check current state
   • DO NOT re-run mutation
8. If existing record has a different hash:
   return:
   `409 IDEMPOTENCY_KEY_REUSE`
9. Only when there is no existing completed record:
   perform authorization.
10. Only then perform state-dependent validation.
11. Execute the mutation transaction.

This ordering is intentional.

Example:

A PATCH succeeds.

The client loses the response.

Later the WorkItem changes state or version.

The client retries the exact same request.

The retry must replay the original stored response instead of failing with a new state/version error.

---

# 27. IDEMPOTENCY TRANSACTION

For a new mutation:

• reserve IdempotencyRecord with null status/response
• perform business mutation
• create Activity
• prepare successful response
• store statusCode and responseBody
• commit

All of this must happen in one transaction.

Do NOT use a separate reservation transaction.

Do NOT introduce:

```text
state = IN_PROGRESS
```

Only successful 2xx results are stored.

This includes:

• normal successful mutation
• successful no op PATCH

Errors must roll back the transaction and remain retryable.

`IDEMPOTENCY_KEY_REUSE` must not mutate anything.

---

# 28. CONCURRENT IDEMPOTENCY REQUESTS

PostgreSQL unique constraint:

```text
(userId, operation, key)
```

must be relied upon for concurrent duplicate requests.

When two identical requests arrive simultaneously:

• one inserts the IdempotencyRecord
• the other waits on the unique constraint
• after the first commits, the loser receives a unique violation

The transaction that receives the unique violation is aborted.

IMPORTANT:

Do not query inside the aborted transaction.

Catch the unique violation OUTSIDE the transaction.

Verify that the violation is specifically for the IdempotencyRecord unique constraint.

Then perform a fresh query.

If the stored requestHash matches:

replay the stored response.

If different:

return:

```text
409 IDEMPOTENCY_KEY_REUSE
```

If the first request rolled back and no IdempotencyRecord exists:

retry the full transaction once.

Never swallow unrelated unique constraint errors.

Use Prisma transaction options approximately:

```text
maxWait: 5000
timeout: 15000
```

---

# 29. IDEMPOTENT REPLAY SECURITY TRADEOFF

Idempotent replay intentionally does not re-check current authorization/state after a completed response is found.

This is required to correctly replay lost responses.

The idempotency scope includes userId, so another user cannot replay another user's stored response.

Document this as an explicit engineering tradeoff.

---

# 30. FRONTEND IDEMPOTENCY

For each user intent:

Generate one idempotency key.

Reuse the same key when retrying the same network request.

Generate a new key after successful completion or when the user changes the mutation input.

Do not generate a new idempotency key automatically for every network retry.

---

# 31. API ROUTES

Implement REST routes under:

```text
/app/api/*
```

At minimum:

```text
GET    /api/teams
GET    /api/teams/:teamId/members

GET    /api/work-items
POST   /api/work-items

GET    /api/work-items/:id
PATCH  /api/work-items/:id

POST   /api/work-items/:id/claim

GET    /api/work-items/:id/activity
```

No delete endpoint is required.

No Activity mutation endpoint.

---

# 32. API RESPONSE DESIGN

Use consistent JSON error responses.

Example:

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message": "The work item has changed. Reload the latest version."
  }
}
```

Use meaningful HTTP status codes:

```text
400 validation
401 unauthenticated
403 unauthorized
404 missing
409 conflict
422 business rule violation
500 unexpected server error
```

Do not expose stack traces to the client.

---

# 33. TEAMS API

GET:

```text
/api/teams
```

Return only teams the current user can read.

ADMIN:

all teams.

USER:

only teams where they have membership.

---

# 34. TEAM MEMBERS API

GET:

```text
/api/teams/:teamId/members
```

Return only assignable users:

• LEAD
• MEMBER

Do not return VIEWER as an assignable user.

Only users authorized to assign on that team may access this endpoint.

Therefore:

• ADMIN
• LEAD of that team

may access it.

Do not create a global user listing for normal users.

---

# 35. WORK ITEM LIST

GET:

```text
/api/work-items
```

All filtering and pagination must happen server side.

Never download the complete WorkItem dataset to the browser.

Support:

• search
• teamId
• status
• priority
• category
• assigneeId
• overdue
• page
• limit
• sort

---

# 36. SEARCH

Search should cover appropriate WorkItem text fields such as:

• title
• description

Use server side filtering.

Do not perform filtering in the browser after loading all records.

Document future options for PostgreSQL trigram/full text search in ENGINEERING_DECISIONS.md.

Do not prematurely introduce search infrastructure that is unnecessary for this assignment.

---

# 37. ASSIGNEE FILTER

`assigneeId` supports:

• `me`
• `unassigned`
• UUID

`me` must be resolved server side from the authenticated user.

The frontend should expose:

• Anyone
• Me
• Unassigned

for normal users.

Specific user filtering should be exposed only to:

• ADMIN
• LEAD of the relevant team

The server must still enforce authorization regardless of what the UI displays.

---

# 38. OVERDUE FILTER

A WorkItem is overdue when:

```text
dueAt < now
```

AND:

```text
status NOT IN:
RESOLVED
CLOSED
```

Use server side time comparison.

---

# 39. PAGINATION

Use offset pagination for WorkItems.

Response should contain:

• items
• page
• limit
• total
• totalPages

Limit:

```text
1 to 100
```

Always use a stable deterministic sort.

For example:

```text
updatedAt DESC, id DESC
```

The `id` must always be the final tiebreaker.

Supported sort fields:

• updatedAt
• createdAt
• dueAt
• priority

Priority ordering:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

For dueAt:

NULL values must be last.

Do not use keyset pagination for WorkItems in this assignment.

Document the tradeoff.

---

# 40. ACTIVITY PAGINATION

Activity must use cursor pagination.

Sort:

```text
createdAt DESC
id DESC
```

Cursor must contain:

```text
createdAt
id
```

Encode it using base64url.

Response:

```json
{
  "items": [],
  "nextCursor": "..."
}
```

Malformed cursor:

```text
400
```

The frontend must provide:

```text
Load more
```

Activity pagination must correctly handle multiple rows with identical timestamps.

The `(createdAt, id)` pair is the cursor boundary.

---

# 41. INDEXING

Use appropriate PostgreSQL indexes.

At minimum include the indexes in the schema specified above.

Avoid N+1 queries.

Use efficient Prisma queries.

Do not fetch unnecessary columns.

The implementation should be able to discuss behavior at:

• thousands of users
• hundreds to low thousands of simultaneous users
• tens of thousands of active WorkItems
• growing Activity history

---

# 42. NEXT.JS CACHING

Every API route handler must explicitly use:

```ts
export const dynamic = "force-dynamic";
```

Client side dynamic fetches should use:

```text
cache: "no-store"
```

Do not accidentally serve stale API data through Next.js caching.

---

# 43. FRONTEND STATE MANAGEMENT

Use TanStack Query v5 for server state.

Do not build a custom global server state cache.

Use URL search parameters for:

• filters
• search
• sort
• page

Search should be debounced.

After successful mutation:

• show pending state
• invalidate/refetch affected queries

Do NOT use optimistic mutations for this assignment.

Correctness is more important than optimistic UI.

---

# 44. STALE EDIT UX

If PATCH returns:

```text
409 STALE_VERSION
```

show a clear conflict message.

Provide:

```text
Reload latest
```

The user should not silently lose their unsaved draft.

Keep the draft available while allowing the user to reload the latest server state.

---

# 45. ACTIVE ITEM REFRESH

Refetch the active WorkItem when the browser window regains focus.

This helps reduce stale editing.

---

# 46. PERSONA SWITCHER

When:

```text
NEXT_PUBLIC_DEMO_PERSONAS=true
```

show a development persona switcher.

Default:

```text
Admin
```

When switching personas:

• send X-User-Id using the selected persona
• clear/invalidate TanStack Query cache
• reload/refetch current data

Do not fetch personas from an API.

Use:

```text
src/lib/personas.ts
```

---

# 47. UI REQUIREMENTS

The UI should feel like a serious internal operations application.

Do NOT make it look like a generic task board.

Build:

• dashboard/work queue
• filters
• search
• WorkItem list
• WorkItem detail
• status
• priority
• team
• assignee
• next action
• due date
• Activity history
• create/edit UI
• claim action
• conflict/error states
• loading states
• empty states
• pagination

Use shadcn compatible UI primitives.

Use Lucide icons where appropriate.

Keep the interface clean and information dense enough for operational work.

---

# 48. WORK ITEM DETAIL

The detail view should clearly show:

• title
• description
• status
• priority
• category
• team
• creator
• assignee
• next action
• due date
• version
• created time
• updated time

Also show Activity history.

Activity should use cursor pagination with:

```text
Load more
```

---

# 49. CREATE WORK ITEM

Create form should include:

• title
• description
• category
• priority
• team
• nextAction
• dueAt

Do not expose server controlled fields such as:

• createdById
• version

unless explicitly appropriate.

Generate an idempotency key for creation.

---

# 50. EDIT WORK ITEM

Edit using PATCH.

Include the currently known:

```text
version
```

Send only allowed changed fields.

Handle:

• 400
• 403
• 409
• 422

appropriately.

---

# 51. CLAIM UI

Provide a clear Claim action when the current user is eligible.

After claim:

• invalidate WorkItem queries
• invalidate detail
• invalidate Activity

Do not optimistically claim.

Use idempotency.

---

# 52. LOADING AND ERROR STATES

Every major data operation must have:

• loading state
• error state
• empty state

Do not leave blank screens when API requests fail.

---

# 53. TESTING ARCHITECTURE

Use Vitest.

Integration tests must run against PostgreSQL.

Do NOT mock PostgreSQL for concurrency tests.

Configure integration test files to run serially at the file level:

```text
fileParallelism: false
```

Tests may still use:

```text
Promise.all
```

internally to test concurrency.

---

# 54. TEST FIXTURE RULES

Tests that mutate data should create their own fixtures with unique IDs.

Do not rely on seeded absolute counts.

Read only tests may use seeded data.

Prefer baseline/delta assertions.

Example:

Instead of:

```text
there are exactly 101 activities
```

use:

```text
activity count increased by exactly 1
```

---

# 55. CONCURRENT CLAIM TEST

Create a test fixture with 5 eligible Finance claimants.

Do NOT alter the normal demo seed just to make this test possible.

Use:

```text
Promise.all
```

with 5 simultaneous claim requests.

Assert:

• exactly 1 succeeds
• 4 return ALREADY_ASSIGNED
• exactly 1 assignee exists
• exactly 1 ASSIGNED Activity exists
• version increments exactly once

---

# 56. OCC TEST

Create one WorkItem.

Read the same version twice.

Send two concurrent/simultaneous PATCH requests using that same version.

Assert:

• exactly 1 succeeds
• exactly 1 returns STALE_VERSION
• version increments once

---

# 57. IDEMPOTENCY TESTS

Implement tests for:

## Test 1 — Concurrent identical idempotent requests

Same:

• user
• operation
• key
• body

Assert:

• one business mutation
• one Activity
• one IdempotencyRecord
• both callers receive equivalent successful response

## Test 2 — Same key, different body

Assert:

```text
409 IDEMPOTENCY_KEY_REUSE
```

No mutation.

## Test 3 — Same key, different users

Assert requests are independent.

## Test 4 — Mutation transaction rolls back

Retry with same key.

Assert retry succeeds.

## Test 5 — Successful request replay

Successful request.

Change WorkItem state/version.

Replay same request.

Assert original stored response is replayed.

Do NOT return STALE_VERSION on the replay.

## Test 6 — Concurrent idempotency loser

Ensure the unique constraint path is handled correctly.

## Test 7 — Failed request

Ensure failed requests do not permanently consume the idempotency key.

Retry must be possible.

---

# 58. ROLLBACK TEST HOOK

For testing transaction rollback, do NOT add a production API flag or environment variable.

Instead, implement a test only injectable hook.

Example concept:

```ts
beforeCommit()
```

The hook may throw after:

• WorkItem mutation
• Activity creation
• response preparation

but before transaction commit.

Assert:

• WorkItem mutation rolled back
• Activity rolled back
• IdempotencyRecord rolled back
• retry with same key succeeds

Do not expose this hook through production HTTP endpoints.

---

# 59. RBAC TESTS

Test:

• Admin can read all teams
• Member cannot read another team
• Viewer can read own team
• Viewer cannot create
• Viewer cannot claim
• Member can only edit assigned items
• Member cannot edit another member's item
• Lead can edit own team
• Admin can edit across teams
• Admin cannot claim a team they are not a member of
• assignee must belong to the WorkItem team
• Viewer cannot be assigned

---

# 60. WORKFLOW TESTS

Test:

• valid transitions
• invalid transitions
• reopening CLOSED
• unauthorized reopening
• claim CLOSED
• RESOLVED → CLOSED
• CLOSED → IN_PROGRESS

---

# 61. PATCH TESTS

Test:

• partial title update
• partial description update
• status update
• priority update
• assignee update
• protected field rejection
• empty patch rejection
• no op patch
• stale version

No op must:

• return 200
• not change version
• not create Activity
• store successful idempotency result

---

# 62. ACTIVITY TESTS

Test:

• creation Activity
• status Activity
• priority Activity
• assignment Activity
• unassignment Activity
• generic update Activity
• claim Activity
• no op has no Activity
• Activity cannot be modified through API

---

# 63. LIST TESTS

Test server side:

• search
• team filter
• status filter
• priority filter
• category filter
• assignee=me
• assignee=unassigned
• UUID assignee filter
• overdue
• pagination
• stable sorting

Do not fetch everything and filter in JavaScript.

---

# 64. ACTIVITY CURSOR TEST

Create multiple Activity rows with deliberately identical timestamps.

Test:

• first page
• next cursor
• final page
• no duplicates
• no missing rows

The test must prove that `id` correctly breaks timestamp ties.

---

# 65. WORK ITEM PAGINATION TEST

Create enough WorkItems to cross multiple pages.

Verify:

• correct page size
• total
• totalPages
• deterministic ordering
• no duplicates between pages
• id tiebreaker works

---

# 66. ERROR HANDLING

Centralize or consistently implement API error handling.

Never expose:

• Prisma internals
• stack traces
• database connection details

Log useful server side information.

Return stable machine readable error codes.

---

# 67. ARCHITECTURE

Use a modular monolith.

Recommended layering:

```text
Route handler
↓
Validation
↓
Authorization
↓
Service
↓
Repository
↓
Prisma
↓
PostgreSQL
```

Do not put large business logic directly inside route handlers.

Services should contain:

• authorization decisions
• state transition rules
• concurrency behavior
• idempotency behavior

Repositories should contain database access.

---

# 68. VALIDATION

Use Zod schemas in:

```text
src/validation
```

Validate:

• request body
• query parameters
• UUIDs
• enum values
• pagination
• idempotency input

Do not rely solely on Prisma errors for validation.

---

# 69. DOMAIN LOGIC

Centralize workflow rules.

For example:

```text
src/domain/work-item.ts
```

should contain functions such as:

• canTransition
• validateTransition
• canAssign
• canClaim
• getEditableFields
• isOverdue

Avoid duplicating business rules across routes.

---

# 70. ENGINEERING DECISIONS DOCUMENT

Create:

```text
ENGINEERING_DECISIONS.md
```

Document approximately 5 major decisions.

At minimum:

1. Modular monolith instead of microservices
2. PostgreSQL + Prisma
3. Optimistic concurrency control
4. Idempotency strategy
5. Pagination/search strategy

For each decision include:

• problem
• chosen approach
• alternatives
• tradeoff

Also document future considerations:

• PostgreSQL trigram/full text search
• caching
• outbox/workers
• real SSO
• scaling read traffic

Do not implement those future systems unless required.

---

# 71. IDEMPOTENCY RETENTION

Document the scale implication of storing IdempotencyRecords.

At larger scale, define a retention policy such as:

```text
24 hours
```

with scheduled deletion.

Do not implement a background worker just for this assignment.

Document it as a production consideration.

---

# 72. AUTHORIZATION TRADEOFF

Document:

```text
403 vs 404
```

for unauthorized existing WorkItems.

The chosen behavior is:

• missing → 404
• unauthorized existing → 403

Explain why this is intentional and what information disclosure tradeoff it creates.

---

# 73. SCALING DISCUSSION

The application should be designed so the architecture can reasonably discuss:

• thousands of users
• hundreds to low thousands simultaneous users
• tens of thousands of active WorkItems
• growing Activity history

The implementation must avoid:

• full dataset downloads
• N+1 queries
• race prone updates
• unconditional stale updates
• unbounded Activity fetches

Do not add Redis/Kafka/microservices merely to claim scalability.

---

# 74. PERFORMANCE

Use:

• proper indexes
• server side pagination
• server side filtering
• bounded responses
• efficient Prisma queries
• stable ordering

Do not load all users globally.

Do not load all WorkItems globally.

Do not load complete Activity history at once.

---

# 75. API CACHE SAFETY

Every API route should include:

```ts
export const dynamic = "force-dynamic";
```

Client dynamic requests:

```text
cache: "no-store"
```

Verify this behavior rather than assuming it.

---

# 76. DOCKER

Create:

```text
docker-compose.yml
```

PostgreSQL should be easy to start locally.

Attempt:

```bash
docker compose up -d
```

If Docker is unavailable:

• do NOT replace PostgreSQL with an in memory mock
• complete all non database implementation
• clearly report that database backed tests could not run

---

# 77. README

README.md must contain:

• project overview
• architecture
• prerequisites
• installation
• environment variables
• PostgreSQL setup
• Docker setup
• Prisma migration commands
• seed commands
• test database setup
• test commands
• development command
• demo persona information
• API overview
• known limitations
• scaling notes

Include exact commands.

---

# 78. PROGRESS.md

Maintain a short:

```text
PROGRESS.md
```

Track:

• completed phases
• current phase
• tests run
• known blockers
• next step

Keep it concise.

This file is the recovery point if the session is interrupted.

---

# 79. GIT COMMITS

Commit after each major phase.

Suggested phases:

1. Project setup
2. Database/schema
3. Auth and authorization
4. WorkItem APIs
5. Concurrency
6. Idempotency
7. Frontend
8. Tests
9. Documentation
10. Final verification

Commit messages should clearly describe the phase.

---

# 80. FINAL VERIFICATION

Before declaring completion:

Run:

```bash
npx tsc --noEmit
```

Run:

```bash
npx vitest run
```

Run the production build.

Verify the application starts.

Verify:

• database migration
• seed
• persona switching
• authentication
• RBAC
• create
• list
• search
• filtering
• pagination
• detail
• claim
• edit
• status transitions
• Activity
• stale version
• concurrent claim
• idempotency
• rollback
• frontend conflict handling

Fix all failures.

Do not leave known TypeScript errors.

Do not leave failing automated tests unless the failure is caused by an explicitly documented external environment limitation such as Docker being unavailable.

---

# 81. FINAL IMPLEMENTATION CLARIFICATIONS

These are mandatory clarifications and override any ambiguity elsewhere.

## 81.1 PERSONA SOURCE OF TRUTH

The deterministic persona UUIDs and metadata must live in:

```text
src/lib/personas.ts
```

The seed script and frontend persona switcher must import from this same file.

Do not duplicate persona IDs.

Do not create an unauthenticated users endpoint for demo personas.

---

## 81.2 ASSIGNEE FILTER

The WorkItem list API must support:

```text
assigneeId=me
assigneeId=unassigned
assigneeId=<UUID>
```

`me` is resolved server side.

The UI must only expose specific user filtering to:

• ADMIN
• LEAD of the relevant team

Normal users should see:

• Anyone
• Me
• Unassigned

Authorization still applies server side regardless of UI behavior.

---

## 81.3 TEST DATABASE LIFECYCLE

Test setup must be deterministic and safe.

Before running integration tests:

1. Verify DATABASE_URL_TEST exists.
2. Verify DATABASE_URL_TEST differs from DATABASE_URL.
3. Verify the database name contains `test`.
4. Connect directly to DATABASE_URL_TEST.
5. Drop/recreate only the public schema of the TEST database.
6. Run Prisma migrations against DATABASE_URL_TEST.
7. Call the exported seed function explicitly as:

```ts
seed(DATABASE_URL_TEST)
```

Never:

• run the normal seed command against an unknown database
• let seed() fall back to DATABASE_URL
• reset the development database from test setup

The test lifecycle must make it structurally difficult to destroy development data accidentally.

---

## 81.4 ACTIVITY TIMESTAMP TIES

The seed must intentionally create groups of Activity records with identical `createdAt` timestamps.

This is required to verify cursor pagination using:

```text
(createdAt, id)
```

rather than only timestamp.

Tests must prove:

• no duplicates
• no missing Activity
• deterministic traversal

---

## 81.5 SHADCN COMPATIBILITY

Do not upgrade:

• React 18
• Next.js 14
• Tailwind 3.4

to satisfy a newer shadcn CLI.

If necessary:

• use a compatible shadcn CLI version
OR
• manually create compatible components

Do not silently change the required stack.

---

# 82. AUTONOMOUS EXECUTION LOOP

Work autonomously.

For each phase:

1. Read the relevant requirements.
2. Inspect the current repository state.
3. Implement.
4. Run TypeScript checks.
5. Run tests.
6. Fix failures.
7. Verify behavior.
8. Update PROGRESS.md.
9. Commit.
10. Continue.

Do not stop after generating files.

Do not claim something is implemented until it has been verified.

If a test exposes a race condition, authorization bug, pagination bug, or idempotency bug, fix the underlying implementation rather than weakening the test.

Prefer correctness over superficial completion.

Do not skip tests simply because the implementation appears correct.

---

# 83. FINAL DELIVERABLE

At the end, the repository must contain a complete working Newtonite application with:

• working Next.js frontend
• working REST API
• PostgreSQL database
• Prisma schema and migrations
• deterministic seed
• development personas
• server side authorization
• WorkItem lifecycle without delete
• Activity history
• optimistic concurrency control
• atomic concurrent claim
• idempotent mutations
• rollback safe idempotency
• server side search
• server side filtering
• pagination
• stable sorting
• TanStack Query frontend state
• conflict handling
• automated integration tests
• Docker setup
• README
• ENGINEERING_DECISIONS.md
• PROGRESS.md
• clean TypeScript build

The final discussion should be able to explain:

• architecture
• authorization model
• concurrency strategy
• idempotency strategy
• failure handling
• database design
• pagination
• indexing
• frontend state
• assumptions
• tradeoffs
• known limitations
• how the system would evolve next week

The objective is not maximum feature count.

The objective is a small, coherent, production minded internal operations system where the dangerous behavior is handled correctly.

---


# 84. FINAL CORRECTIONS (override any ambiguity above)

## PATCH field classes (replaces the wording in Section 20)
- Immutable/unknown fields (`id`, `teamId`, `createdById`, any unknown key): always 400 INVALID_REQUEST, whatever the value.
- Role-restricted fields (a field the caller's role may not change, e.g. `priority` for a MEMBER): if the value differs from the current one -> 403 FORBIDDEN; if equal to the current one -> ignored.
- `version` is required and is not a data field.

## Create contract
- Body: title, description, category, teamId, plus optional priority, nextAction, dueAt. Any other field -> 400.
- Result: status OPEN, unassigned, version 1, a CREATED Activity in the same transaction, response 201 with the full item.

## Error codes (all responses use the Section 32 shape)
INVALID_REQUEST 400, UNAUTHENTICATED 401, FORBIDDEN 403, ASSIGNEE_NOT_TEAM_MEMBER 403, NOT_FOUND 404, IDEMPOTENCY_KEY_REQUIRED 400, IDEMPOTENCY_KEY_REUSE 409, STALE_VERSION 409, ALREADY_ASSIGNED 409, INVALID_STATUS_TRANSITION 422, CLAIM_NOT_ALLOWED_FOR_STATUS 422, INTERNAL_ERROR 500.
An assignee violation causes no mutation and no Activity.

## Activity endpoint
GET /api/work-items/:id/activity uses the same read authorization as the work item (403 if unauthorized, 404 if missing). `limit` defaults to 30 and must be 1-100.

## Prisma client
Create one PrismaClient in src/lib/prisma.ts using the globalThis pattern; repositories import it. Only seed(databaseUrl) creates its own client.

## Test database wiring (extends Sections 12-13 and 81.3)
- vitest.config loads .env/.env.test with dotenv, since Vitest does not do this by itself.
- globalSetup runs the safety checks FIRST, comparing the ORIGINAL DATABASE_URL and DATABASE_URL_TEST values. It then confirms with `SELECT current_database()` that the connected database name contains "test" before any destructive step.
- Migrations run via `prisma migrate deploy` in a subprocess whose environment sets DATABASE_URL to the test URL.
- A setupFiles script sets `process.env.DATABASE_URL = DATABASE_URL_TEST` in every test worker, before any application module is imported, so the app's Prisma singleton can only connect to the test database.
- Tests call the exported route handlers (GET/POST/PATCH) directly with constructed NextRequest objects carrying X-User-Id and X-Idempotency-Key. No HTTP server is needed.
- For development, `prisma.seed` in package.json runs a small wrapper that calls seed(process.env.DATABASE_URL).


# IMPORTANT FINAL INSTRUCTION

Treat this entire specification as authoritative.

Do not build only the first sections.

Do not stop at the database schema.

Do not replace the concurrency/idempotency requirements with a simpler CRUD implementation.

Do not invent weaker behavior where this specification gives an explicit rule.

Before declaring the assignment complete, verify every major requirement from Sections 1 through 83 against the actual code and tests.
