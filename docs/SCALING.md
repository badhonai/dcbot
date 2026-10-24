# Scaling roadmap

## 1. Validate one instance first

- Confirm the configured model exists and supports the selected parameters.
- Exercise mention/reply triggers, missing Discord permissions, 429s, disconnects, long replies, `/uns`, and SIGTERM in a staging guild.
- Add global provider concurrency/quota limits and per-user cooldowns; per-channel queues alone do not protect account-wide quotas.
- Budget history by tokens and bytes. Add request IDs, latency, queue depth, provider usage/cost, error counts, and health monitoring. Keep message content and credentials out of logs.
- Decide the retention/consent policy: the current bot observes all allowed-channel messages, not just mentions.

**Gate:** measured latency/error/cost targets and intentional overload behavior under expected peak traffic.

## 2. Durable conversation state

- Use a shared conversation repository (e.g. Redis for expiring context, PostgreSQL when durable history is required).
- Introduce response IDs grouping all Discord chunks, and store message IDs for reliable undo and edit/delete synchronization.
- Define TTLs, maximum channel counts, deletion/export workflows, and access controls.
- Persist processed event/message IDs to support replay-safe ingestion. Model a pending/sent/failed response lifecycle; Discord delivery and database writes are not one atomic transaction.
- Add integration tests against the actual storage engine; migrate explicitly rather than hiding persistence inside handlers.

**Gate:** recovery after restart, bounded retention, and deterministic deletion behavior.

## 3. Distributed execution

- Use Discord's supported sharding approach as guild traffic requires it. Do not launch identical gateway clients blindly.
- Route each channel's work to a single owner or use distributed ordered jobs/leases. The existing in-memory queue does not coordinate across processes.
- Add distributed provider rate limits, idempotency, backpressure, retry budgets with jitter, dead-letter handling, and lease expiry tests.
- At distributed scale, move the current automatic per-guild command sync into a single release operation or coordinated owner; its coalescing is process-local. Separate gateway ingestion from AI workers only when measurements justify the additional infrastructure.

**Gate:** no duplicate responses or cross-channel state leakage during worker failures, reconnects, or rolling deploys.

## 4. Feature growth

Split `discord/handlers.js` into per-event and per-command modules when adding more commands. Keep provider-specific request details in adapters. Introduce a service layer for shared response lifecycle/persistence rules as those grow. Avoid creating unused abstractions, a microservice fleet, or database infrastructure before requirements and traffic justify them.
