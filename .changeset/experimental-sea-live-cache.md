---
"__section": feature
---
Add an experimental shared live-read cache for the Rust service

The Rust service can share published events between caught-up readers instead of reading the archive for each delivery.
The native server and `BuiltInSeaHost::new` enable the cache by default for controlled use.
To restore storage-backed delivery when starting the native server:

```bash
SEA_EXPERIMENTAL_LIVE_CACHE=false sea-webtransport-server
```

Direct Rust callers can opt in with `LocalSequencer::recover_with_live_cache`.
Generic storage hosts and direct Rust/WASM sequencer construction keep their existing storage-backed default.
Live subscriptions support independent explicit revocation without closing their author session.
Finite reads remain storage-backed.

This experiment has no automatic lag limit: a stalled reader can retain unbounded history.
Do not enable it as a production resource policy.
