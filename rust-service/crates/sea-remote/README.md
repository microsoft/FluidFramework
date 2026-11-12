# Sea Remote

Shared native storage adapter for the [PostgreSQL](../sea-postgres/README.md) and [Azure](../sea-azure/README.md) backends.
Applications normally construct one of those backends instead of implementing this crate's journal interface.
Neither provider client is a dependency of this crate or of `sea-core`.

The adapter implements all document storage components over an exclusively owned, ordered record journal.
Records have a versioned encoding and content checksum.
Recovery validates the complete history and its blob, event, and snapshot dependencies.
Archive positions are consecutive event ordinals; snapshot positions are sparse event ordinals.
Blob payloads remain in remote storage, while an opening retains indexes of content identities and event record locations.
Opening scans all records, including blob payloads, in bounded pages.
This initial implementation favors verifiable recovery over fast opening of large histories.
No history or content is pruned.
Each encoded record is limited to 4 MiB; oversized requests fail before publication.

Components, streams, and availability handles retain exclusive writer ownership.
Handles are compatible only with their original opening.
Dropping the last owner schedules asynchronous release.
Reopening through the same factory waits for that release; another process may briefly receive a conflict while release is pending.
Keep the Tokio runtime alive through `shutdown` to observe release errors.
`shutdown` closes admission, drains operations, and invalidates retained components.
`flush` waits for admitted operations; it reports uncertainty rather than inventing a reconciliation boundary.

Cancellation after starting a journal mutation poisons the opening.
An uncertain append is never retried, and all later observations fail until reopening.
Recovery must acquire provider-enforced ownership before scanning, so delayed old requests cannot extend recovered history.
Reads reject nonempty ranges with bounds beyond the initialization head.
Live readers poll the opening, retain no background read task, and stop on invalidation.
Storage errors preserve the common SEA classification and include diagnostic context.

Provider service tests run the shared conformance suite.
Run `cargo test -p sea-remote` for format and adapter regression tests.
