# Newtonite — Engineering Decisions

This document details five key architectural decisions made during the design and implementation of the Newtonite Operational Work Management System, along with future production scale considerations.

---

### 1. Modular Monolith Architecture over Microservices
- **Problem**: Microservices introduce distributed transaction complexity, network latency overhead, split domain logic, and operational deployment friction for a core internal operational work queue.
- **Chosen Approach**: Built as a cohesive modular monolith using Next.js 14 App Router, standard REST route handlers, domain services, repository abstraction, and PostgreSQL.
- **Alternatives**: Microservices architecture splitting teams, work items, and activity feeds into separate HTTP services.
- **Trade-off**: Requires strict internal domain boundary discipline within the codebase, but eliminates distributed consensus issues, simplifies atomic transactions, and ensures straightforward local/container deployment.

---

### 2. PostgreSQL + Prisma 6 ORM
- **Problem**: Need typed data access, relational integrity, deterministic migrations, and efficient SQL generation without writing raw string queries throughout the service layer.
- **Chosen Approach**: PostgreSQL 16 managed with Prisma 6 ORM using explicit migration files (`prisma migrate deploy`) and a singleton `PrismaClient` pattern across route handlers and repositories.
- **Alternatives**: Raw SQL queries via `pg` client, Query builders (Knex/Kysely), or NoSQL databases (MongoDB).
- **Trade-off**: ORM abstractions add minor overhead compared to hand-optimized SQL, but provide end-to-end TypeScript type safety, migration reproducibility, and schema protection against unauthorized mutations.

---

### 3. Optimistic Concurrency Control (Version-Based Locking)
- **Problem**: In a multi-user operational environment, multiple team members viewing the same work item might attempt simultaneous updates or claims, leading to silent lost updates or illegal state overwrites.
- **Chosen Approach**: Every `WorkItem` maintains a monotonic integer `version` field. Any PATCH mutation requires the caller's currently known `version` and executes a conditional update (`WHERE id = :id AND version = :expectedVersion`). If zero rows are updated, the request yields `409 STALE_VERSION`.
- **Alternatives**: Pessimistic database row locks (`SELECT ... FOR UPDATE`), which increase lock hold times and create deadlock risks under high concurrent load.
- **Trade-off**: Requires callers to supply the current version and handle version conflicts cleanly in the UI (with draft preservation and reload prompts), but eliminates lock contention and guarantees data consistency.

---

### 4. Two-Phase Request Idempotency via `X-Idempotency-Key`
- **Problem**: Unreliable network connections, client retries, or user double-clicking can cause duplicate execution of mutating operations (e.g. creating work items or claiming critical incidents).
- **Chosen Approach**: Mutating requests accept an `X-Idempotency-Key` header. The server checks for completed records before authorization/validation to safely replay cached responses. Unfulfilled requests reserve an `IdempotencyRecord` inside an isolated transaction. Request payload hashes guarantee that key reuse with mismatched parameters is rejected with `409 IDEMPOTENCY_KEY_REUSE`.
- **Alternatives**: Client-side deduplication alone, or external Redis key-value storage.
- **Trade-off**: Adds database storage for idempotency records, but guarantees strict at-most-once execution for critical mutations directly inside the database transaction boundary.

---

### 5. Hybrid Pagination & Server-Side Search Strategy
- **Problem**: Fetching entire datasets into memory causes high memory overhead, slow response times, and unstable pagination when rows share identical timestamps.
- **Chosen Approach**: Server-side offset pagination with secondary `id` sorting for `WorkItem` listings (`GET /api/work-items`). Cursor-based pagination (`createdAt`, `id` tiebreaker) for append-only `Activity` logs (`GET /api/work-items/:id/activity`). Server-side filtering and search push evaluation down to indexed PostgreSQL columns.
- **Alternatives**: Client-side filtering of full datasets, or offset pagination for activity streams (vulnerable to page drift on append).
- **Trade-off**: Requires composite cursor encoding (base64url) and structured index design, but provides stable performance under high activity volumes and prevents missing or duplicated log entries.

---

## Future Considerations for Scaling

1. **PostgreSQL Trigram / Full-Text Search**: Replace substring matching with PostgreSQL `pg_trgm` or `tsvector` indexes for sub-millisecond full-text queries as work item counts grow into millions.
2. **Read-Replica Query Routing**: Offload read-heavy `GET` queries (search, activity feeds, team listings) to read replicas while routing mutating transactions to the primary database node.
3. **Outbox Pattern & Background Processing**: Implement an explicit Transactional Outbox pattern with background workers for asynchronous external integrations (e.g., email/Slack alerts) without blocking HTTP handler execution.
4. **Caching Layer**: Introduce Redis for short-term caching of team memberships and static metadata, paired with invalidation hooks on membership changes.
5. **Production Authentication & SSO**: Transition from development `X-User-Id` header authentication to OIDC / SAML SSO with JWT verification middleware.
