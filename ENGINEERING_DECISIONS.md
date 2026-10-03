# Newtonite Operations — Engineering Decisions

This document outlines key architectural decisions made during the design and implementation of the Newtonite Operational Work Management System, focusing on the tradeoffs chosen for an internal operations tool.

### 1. Modular monolith

**Decision:** The application is structured as a cohesive modular monolith using Next.js App Router (for both the frontend and REST API handlers), alongside domain services, repositories, and PostgreSQL.

**Why:** While microservices provide independent scalability, they introduce distributed transaction complexity, network latency, and operational overhead. For a core internal operational work queue where data consistency and relational integrity across users, teams, and work items are paramount, a monolith eliminates distributed consensus issues. It simplifies atomic transactions and ensures straightforward local and container deployments without the need for orchestrating multiple services.

### 2. PostgreSQL and Prisma

**Decision:** PostgreSQL 16 is used as the relational database, managed via the Prisma ORM with explicit migration files.

**Why:** Operational work coordination requires strict data integrity, structured schemas, and complex relational querying (e.g., filtering work items by assignee, team, status, and sorting by priorities). PostgreSQL excels at these workloads. Prisma was chosen over raw SQL or query builders because it provides end-to-end TypeScript type safety and deterministic schema migrations. The slight performance overhead of an ORM is a worthwhile tradeoff for the developer velocity and compile-time guarantees it provides against illegal state mutations.

### 3. Team-scoped authorization

**Decision:** Authorization is handled via a combination of global system roles (ADMIN, USER) and granular team-scoped roles (LEAD, MEMBER, VIEWER), evaluated at the service layer.

**Why:** Operational work is inherently siloed by department (Finance, Engineering, etc.) to protect sensitive information and prevent accidental cross-team interference. Implementing RBAC strictly at the service layer—rather than relying solely on UI hiding or database row-level security—ensures that all REST API endpoints independently verify if the authenticated user has the necessary team membership and role to read or mutate a specific resource.

### 4. Atomic claim and optimistic concurrency

**Decision:** Work items are claimed using atomic database updates (`WHERE id = :id AND assignee_id IS NULL`), and all edits rely on Optimistic Concurrency Control (OCC) using a `version` field.

**Why:** In a high-concurrency environment, multiple team members might view the same unassigned incident and attempt to claim it simultaneously. Atomic claims prevent race conditions natively in the database without requiring heavy row-level locking (`SELECT FOR UPDATE`), which can cause deadlocks. Similarly, OCC ensures that if two users try to edit a work item simultaneously, the second user receives a `409 STALE_VERSION` error, preventing silent lost updates while maintaining high throughput.

### 5. Idempotency and append-only activity history

**Decision:** Mutating endpoints accept an `X-Idempotency-Key` to safely replay duplicate requests, and all state changes emit an immutable `Activity` record. WebSockets and background workers were intentionally omitted in favor of this model.

**Why:** Unreliable networks or user double-clicking can cause destructive duplicate operations (like creating two identical work items). Storing idempotency records in the database guarantees strict at-most-once execution. When combined with an append-only activity history, every change is fully auditable. We intentionally omitted WebSockets and background job queues to keep the architecture simple and robust; users pull updates predictably, and background complexity is deferred until scale necessitates an explicit outbox pattern.
