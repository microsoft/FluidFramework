---
"__section": other
---
Observe Rust live-cache soft-budget pressure

Cache-enabled local sequencers expose a weak per-opening observer for maintained subscription, claim, entry, and payload-byte counts.
Callers can wait for retained entries or payload bytes to cross soft targets without blocking accepted writes or discarding reader-required events.
Terminal opening state wakes observers; cancellation removes only the wait registration.

The cache still reclaims unneeded entries immediately.
These advisory observations exclude downstream payload handles and transport sends and do not enable a session policy or impose a hard memory bound.
