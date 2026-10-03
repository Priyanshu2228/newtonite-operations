# Newtonite - Engineering Decisions

This document outlines five key architectural and engineering decisions made during the design and implementation of the Newtonite Operational Work Management System.

---

### 1. Optimistic Concurrency Control (Version-Based Locking)
- **Problem**: In a multi-user environment, two employees viewing the same work item might attempt to reassign or change its state simultaneously, leading to silent lost updates or inconsistent state transitions.
- **Decision**: Every `WorkItem` maintains an integer `version` field. Any state-modifying transaction must supply the `version` it expects. The database update operation includes `WHERE id = :id AND version = :expectedVersion`, incrementing `version` by 1 on success.
- **Trade-off**: If a version conflict occurs, the server responds with a `409 Conflict` error. The client receives a clean conflict signal to refresh its state rather than overwriting another user's work silently.

---

### 2. Request Idempotency via `X-Idempotency-Key`
- **Problem**: Operational actions (such as approving a payment investigation or claiming a production incident) might be resubmitted due to network retries or user double-clicking.
- **Decision**: Mutating API requests support an optional `X-Idempotency-Key` HTTP header. The system checks the `IdempotencyKey` database table before processing. If a matching key exists, the cached status code and response payload are returned immediately. Otherwise, the operation executes within a transaction and records the result.
- **Trade-off**: Requires dedicated DB storage for idempotency keys, but guarantees at-most-once execution for critical business workflows.

---

### 3. Server-Enforced RBAC & Resource-Level Authorization
- **Problem**: Client-side UI restriction is insufficient for security in multi-team organizations.
- **Decision**: Authorization logic is centralized in a dedicated `AuthorizationService` executed inside API routes and domain handlers. Rules check system roles (`ADMIN`, `USER`), team memberships (`LEAD`, `MEMBER`, `VIEWER`), and resource assignment state (e.g., only a Team Lead of the assigned team can approve `PENDING_APPROVAL` items).
- **Trade-off**: Slightly increases API latency due to membership lookups, offset by standard database indexing on `[userId, teamId]`.

---

### 4. In-Database Asynchronous Processing Queue
- **Problem**: Performing non-critical tasks (notifications, audit enrichment, reporting) synchronously blocks API response times and risks failing the primary user transaction if a secondary system is unavailable.
- **Decision**: Secondary tasks are enqueued as `AsyncJob` records in PostgreSQL. A resilient background worker picks up `PENDING` jobs, executes them with exponential retry backoff (up to `maxAttempts`), and transitions their status to `COMPLETED` or `FAILED`.
- **Trade-off**: Avoids external dependencies (like Redis/BullMQ), keeping Docker setup simple and consistent while providing durable queue semantics backed by PostgreSQL.

---

### 5. Immutable Audit Trail & Delta Activity Logging
- **Problem**: Regulatory and management requirements dictate that operational actions cannot silently disappear or change without accountability.
- **Decision**: Work item mutations atomically create `ActivityLog` records containing the actor ID, action type, and JSON payload of modified attributes (before and after states). `ActivityLog` records cannot be updated or deleted through normal APIs.
- **Trade-off**: Increases database write volume per mutation, but ensures 100% audit compliance and simple audit timeline rendering.
