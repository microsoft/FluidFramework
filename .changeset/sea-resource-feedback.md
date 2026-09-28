---
"__section": other
---
Connect Rust document pressure to opt-in session policy

The experimental resource-policy host now waits for durable storage's preparation and mutation pressure before invoking new application/content writes.
Pending logical inputs and live-reader admission remain independently bounded.
Memory and buffered-file writes do not wait for a durable-pressure signal.
Terminal observations refuse new operations before source invocation; ambiguity about earlier work is retained as a cause, not reported as uncertainty about the refused operation.

Above outgoing-cache soft targets, the shared document policy refuses new sessions/live readers and independently sheds oldest unread live subscriptions.
It does not pause already accepted work or existing authors for output pressure.
Historical and caught-up readers are not selected; subscription shedding does not close author membership.

The policy requires live caching and remains default-off.
Its weak, coalesced shedding task is not an autonomous close owner or a hard memory bound.
Caller/host-driven close, downstream payload ownership, transport limits, and reconciliation contracts remain unchanged.
