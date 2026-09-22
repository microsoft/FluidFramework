# Sea Integration Tests

This test-only crate validates composition across Sea implementations without adding cross-crate test dependencies to production crates.
Unlike `sea-conformance`, which defines reusable laws for individual implementations, these tests assemble concrete implementations into complete stacks.
WebTransport is one optional session decorator under test, alongside compression and encryption.

## Session Composition Matrix

The [composition matrix](tests/session_composition.rs) runs independent scenario and layer-configuration tables.
Each scenario runs against every configured stack:

| Scenario | Coverage |
| --- | --- |
| Open/close | Empty-session lifecycle without content or publisher registrations. |
| Events and snapshots | Blob trees, snapshot publication, bounded replay, and live delivery. |
| Reconnect | Fresh memberships/connections, retained history, and new snapshot publication. |
| Collaboration | Concurrent authors, identical ordered delivery, shared content, and publisher coordination. |
| Collaboration stress | Four collaboration rounds with repeated peer reconnects, 36 committed events, four snapshots, historical snapshot lookup, and catch-up after writes made while the peer is disconnected. |

Configurations range from a bare session to duplicate payload wrappers, reversed compression/encryption ordering, multiple real loopback WebTransport hops, and a nine-layer mixed stack.

Transport probes count decoded submissions at each endpoint and inject a rejection at each hop.
The rejection must reach the caller without commitment or traffic to deeper hops; after removing it, submissions must traverse every hop.
Scenarios check endpoint counts for every connection generation, including all three hops of `repeated_stress` after reconnect.

The collaboration scenarios use empty and binary event payloads up to 8 KiB, nested blob directories with shared subtrees, and exact plaintext history expectations independent of the returned events.
They cancel an initialized waiting read while other subscriptions remain active, reject read-only publication and stale fences, check client-selected suppression and renewed Sea selection, and reject wrong parents and conflicting snapshot roots.
Rejected mutations and exact snapshot-publication retries must leave no extra history entries.

Each matrix cell has a fresh in-memory document and a deadline.
Reconnect rebuilds the entire stack with fresh memberships and connections over the retained sequencer.
In collaboration scenarios, one author remains connected and keeps writing while the peer reconnects.
The bounded stress scenario does not exhaustively cover failures: process crashes, packet loss, malformed wire data, key rotation, and performance qualification are outside this matrix.
A single-session test host supplies connection setup, while production session dispatch and native transport handle the operations.
Endpoints are shut down after each case and aborted on unwinding.

## Validation

Run from `rust-service/`:

```bash
cargo test -p sea-integration-tests
cargo clippy -p sea-integration-tests --all-targets -- -D warnings
```

The crate is included in the [workspace validation commands](../../DEVELOPMENT.md#canonical-workspace-commands).
