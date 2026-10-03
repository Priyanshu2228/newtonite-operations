# Newtonite — PROGRESS.md

## Session 1 — COMPLETED ✅

**Last Updated:** 2026-10-03

---

## What is implemented

### Infrastructure & Configuration
- `.nvmrc` with Node 20
- `docker-compose.yml` — PostgreSQL 16 on port 5433, init script creates `newtonite_test` DB
- `docker/init-test-db.sql` — creates `newtonite_test` on container init
- `.env` — `DATABASE_URL` and `DATABASE_URL_TEST` pointing to port 5433
- `.env.example` — documented env template
- `.env.test` — defines only `DATABASE_URL_TEST` (does NOT set DATABASE_URL, so safety check passes)
- `package.json` — all required dependencies: Next.js 14, React 18, TypeScript, Tailwind 3.4, Prisma 6.x, TanStack Query v5, Zod, Vitest, dotenv, pg

### Database
- `prisma/schema.prisma` — exact schema from SPEC.md Section 6:
  - Enums: `GlobalRole`, `TeamRole`, `Category`, `Priority`, `Status`, `ActivityAction`
  - Models: `User`, `Team`, `TeamMember`, `WorkItem`, `Activity`, `IdempotencyRecord`
  - All required indexes per spec
  - No `AsyncJob`, `Comment`, or any non-spec model
- `prisma/migrations/20261003111104_init/migration.sql` — Prisma migration (NOT db push)
- Prisma 6.x (v6.19.3) — verified

### Personas & Seed
- `src/lib/personas.ts` — deterministic UUIDs for all 6 personas, single source of truth
- `src/lib/seed.ts` — `seed(databaseUrl)` function:
  - Accepts explicit DB URL, never silently falls back
  - Creates 6 Users, 3 Teams (Finance, Engineering, Operations), 6 TeamMemberships per spec
  - Creates 35 WorkItems (Finance: 12, Engineering: 12, Operations: 11)
  - Creates 155 Activity records, including 120 on one item with **deliberate identical-timestamp groups** for cursor pagination tiebreaker testing
  - Upsert-style: clears data and re-seeds for deterministic test runs
- `prisma/seed-dev.ts` — dev wrapper: calls `seed(process.env.DATABASE_URL)`
- `prisma/seed.ts` — package.json prisma.seed entry point wrapper

### Development Authentication (SPEC Section 8)
- `src/auth/context.ts` — `getUserContext(userId)`:
  - Reads `X-User-Id` from caller
  - Loads `User` + `memberships` from PostgreSQL
  - Never accepts role/team claims from client
  - Returns `UserContext` with `globalRole` and `memberships`

### Authorization & Domain Logic (SPEC Sections 14-22)
- `src/domain/work-item.ts` — all domain rules:
  - `canReadTeam`, `canCreateInTeam`, `getUserTeamRole`
  - `isValidStatusTransition` — exact transition table from Section 19
  - `validateStatusTransition` — enforces CLOSED→IN_PROGRESS only for ADMIN/LEAD
  - `validateClaimEligibility` — forbids CLOSED; requires LEAD/MEMBER team role
  - `validatePatchPermissions` — Section 84 PATCH field classes: unknown/immutable → 400; role-restricted field with different value → 403; same value → ignored; MEMBER limited to title/description/status
  - `isOverdue`

### Repository Layer
- `src/repositories/work-item.repository.ts`:
  - `findById` with includes
  - `validateAssigneeMembership` — checks LEAD/MEMBER, rejects VIEWER
  - `atomicUpdate` — conditional `updateMany(where: { id, version })`, returns count
  - `atomicClaim` — conditional `updateMany(where: { id, assigneeId: null, status: { not: CLOSED } })`, returns count

### Service Layer
- `src/services/work-item.service.ts` — WorkItemService:
  - `createWorkItem` — validates, checks permission, creates + CREATED Activity in one transaction
  - `updateWorkItem` — validates, checks permission, validates transitions, validates assignee membership, atomic OCC update + per-field Activity records in one transaction; no-op returns current item without version change
  - `claimWorkItem` — validates eligibility, atomic conditional claim + ASSIGNED Activity (via: "claim") in one transaction; losers do fresh read to distinguish ALREADY_ASSIGNED vs CLAIM_NOT_ALLOWED_FOR_STATUS vs NOT_FOUND

### Validation
- `src/validation/work-item.ts`:
  - `CreateWorkItemSchema` (strict — rejects unknown fields per Section 84)
  - `parsePatchPayload` — rejects unknown/protected keys before Zod parse (400 INVALID_REQUEST)
  - All enum validations, UUID validations

### Error Handling
- `src/lib/errors.ts` — all error classes per Section 84 error code table:
  - `InvalidRequestError` (400), `IdempotencyKeyRequiredError` (400), `UnauthenticatedError` (401), `ForbiddenError` (403), `AssigneeNotTeamMemberError` (403), `NotFoundError` (404), `IdempotencyKeyReuseError` (409), `StaleVersionError` (409), `AlreadyAssignedError` (409), `InvalidStatusTransitionError` (422), `ClaimNotAllowedForStatusError` (422), `InternalServerError` (500)
  - `formatErrorResponse` helper

### Prisma Client
- `src/lib/prisma.ts` — single PrismaClient using `globalThis` pattern per Section 84

### Test Infrastructure (SPEC Sections 13, 81.3, 84)
- `vitest.config.ts` — `fileParallelism: false`, `globalSetup`, `setupFiles`
- `tests/globalSetup.ts` — mandatory safety checks:
  1. Reads `.env` and `.env.test` separately via `dotenv.parse`
  2. Compares DATABASE_URL vs DATABASE_URL_TEST (must differ)
  3. Verifies test DB name contains "test"
  4. Connects to test DB, runs `SELECT current_database()` before ANY destructive step
  5. Drops/recreates public schema of test DB only
  6. Runs `npx prisma migrate deploy` via subprocess with `DATABASE_URL=testUrl`
  7. Calls `seed(DATABASE_URL_TEST)` explicitly
- `tests/setup.ts` — sets `process.env.DATABASE_URL = DATABASE_URL_TEST` in each worker
- `scripts/create-test-db.ts` — `npm run db:test:create` fallback

---

## Test Results (Session 1)

```
 ✓ tests/session1.test.ts  (5 tests) 699ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  8.23s
```

### Tests Covered
1. **Concurrent Claim (SPEC §55)** — 5 simultaneous claimants, exactly 1 wins, 4 get ALREADY_ASSIGNED, version +1, exactly 1 ASSIGNED Activity with `via: "claim"`
2. **OCC (SPEC §56)** — 2 simultaneous PATCH with same version, exactly 1 wins, 1 gets STALE_VERSION, version +1
3. **RBAC (SPEC §59)** — Viewer cannot create, cross-team create blocked, Member cannot edit others' items, VIEWER cannot be assigned (ASSIGNEE_NOT_TEAM_MEMBER)
4. **Workflow Transitions (SPEC §60)** — Full chain OPEN→IN_PROGRESS→RESOLVED→CLOSED, CLOSED claim rejected (422), CLOSED reopen by Member rejected (403), CLOSED reopen by Lead succeeds, invalid OPEN→CLOSED rejected (422)
5. **Patch Validation & No-Op (SPEC §61, §84)** — protected field rejected (400), unknown field rejected (400), no-op returns 200 with unchanged version and no new Activity

---

## TypeScript

```
npx tsc --noEmit: EXIT:0 (clean)
```

---

## Confirmed Absent (per SPEC prohibition)
- No AsyncJob model
- No job queues, Redis, Kafka, WebSockets
- No Server Actions
- No microservices
- No Prisma 7
- No `prisma db push` used

---

## Session 2 — COMPLETED ✅

- [x] `GET /api/work-items` — list with server-side search, filter, offset pagination
- [x] `POST /api/work-items` — create endpoint with idempotency
- [x] `GET /api/work-items/:id` — detail endpoint (403 vs 404 behavior)
- [x] `PATCH /api/work-items/:id` — update endpoint with idempotency
- [x] `POST /api/work-items/:id/claim` — claim endpoint with idempotency
- [x] `GET /api/work-items/:id/activity` — cursor pagination (base64url, tiebreaker)
- [x] `GET /api/teams` — scoped list
- [x] `GET /api/teams/:teamId/members` — assignable members only
- [x] Idempotency service (7 test scenarios from SPEC §57)
- [x] `beforeCommit` rollback hook for test §58
- [x] All Session 2 integration tests
- [x] `export const dynamic = "force-dynamic"` on all route handlers
- [ ] ENGINEERING_DECISIONS.md (5+ decisions)

## Session 3 — Remaining Work

- [ ] Next.js App Router frontend
- [ ] TanStack Query v5 state management
- [ ] Persona switcher (NEXT_PUBLIC_DEMO_PERSONAS=true)
- [ ] WorkItem list/detail/create/edit UI
- [ ] Claim UI
- [ ] Stale edit UX with conflict modal ("Reload latest")
- [ ] Activity history with "Load more" cursor pagination
- [ ] URL-based filter state
- [ ] Debounced search
- [ ] Loading/error/empty states
- [ ] Window focus refetch
- [ ] README.md with all required sections
- [ ] Final verification pass

---

## Known Limitations / Notes

- `package.json#prisma` key triggers Prisma 7 deprecation warning — this is harmless for Prisma 6 usage
- Vitest CJS deprecation warning from Vite — cosmetic only, does not affect test results
- PostgreSQL runs on port 5433 to avoid conflict with system PostgreSQL 14 (port 5432)
