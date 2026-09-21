# Historical Deferral Reconciliation

This record reconciles the six [iteration 0016 deferred candidates](iterations/0016/quality-inventory.md#deferred-candidates) against `rust-service` commit `86fb79d4ed3cf3a5049ac42861da4ce4210a1777` on 2026-09-19.
It does not change product contracts or the completed iteration records.
Broader exclusions, including power-loss qualification and retention, are outside this review.

This is a user-requested targeted reconciliation, not a new quality iteration or a complete crate audit.
The stopping condition is a supported disposition for each named deferral, with remaining gaps tracked in Known Issues.

## Summary

| Historical deferral | Current disposition |
| --- | --- |
| Partial-I/O failure recovery | Resolved for the documented buffered and durable policies. |
| Ambiguous append resolution | Resolved under the replacement settlement contract. |
| Stale durable crash controls | Superseded by removal of the old public controls. |
| Browser disconnect resource release | Close is implemented; focused platform evidence remains open. |
| Injected disconnect failure state | JavaScript injection is removed; the generic Rust error-state contract remains deferred. |
| Connection-establishment timeout | Resolved by the merged admission fix. |

## Partial-I/O Failure Recovery

**Disposition: Resolved for the current documented recovery policy.**

The [iteration 0015 storage report](iterations/0015/phase-2/storage.md) deferred deterministic partial-write and flush evidence because the old implementation had no injectable writer.
The replacement [journal](../crates/sea-file/src/journal.rs) has test-only `BeforeWrite`, `PartialWrite`, and `AfterSync` hooks.
The shared file engine now marks an opening unusable after writing begins and clears that state only after successful completion.
The [current contract](../crates/sea-file/README.md#cancellation-and-failures) requires recovery before further authoritative observations after an ambiguous write.

`storage::tests::journal_faults_preserve_prefix_and_block_uncertain_observations` in [storage tests](../crates/sea-file/src/storage.rs) exercises all three hooks under both durability policies.
It checks rejection without mutation, blocked head and resolution observations after uncertain writes, and recovered event counts.
Buffered recovery rejects an incomplete tail; durable recovery truncates it and preserves the complete prefix.
The post-write fault preserves the complete record on reopen; in buffered mode this is not a synchronization guarantee.
This closes the missing deterministic evidence, not the separate [production durability qualification](../KNOWN_ISSUES.md#rs-003-durable-storage-has-qualified-guarantees).

## Ambiguous Append Resolution

**Disposition: Resolved under the replacement settlement contract.**

The historical deferral required a shared cancellation and resolution contract.
The current [submission identity and settlement contract](../crates/sea-sequencer/README.md#submission-identity-and-settlement) now requires one retained backend future, no implicit retry, and bounded reconciliation after returned ambiguity.
An authoritative complete scan can establish commitment or absence; failed reconciliation produces `RecoveryRequired` and blocks mutation and absence claims.
The [implementation](../crates/sea-sequencer/src/session.rs) implements the bounded scan in `append_once`.

The [fault tests](../crates/sea-sequencer/src/fault_tests.rs) discriminate these decisions directly:

- `returned_ambiguity_is_scanned_and_rejection_requires_fresh_membership` distinguishes committed, absent, and rejected results and checks append-call counts.
- `failed_reconciliation_blocks_mutation_and_absence_claims_until_recovery` injects head and read failures, blocks unsafe progress, and recovers the committed identity.
- `cancelling_before_or_after_commit_retains_the_same_backend_future_until_settlement` gates both sides of commitment, cancels callers, and verifies ordered settlement without duplicate appends.
- `failed_append_and_cancelled_ack_end_announced_prefix_before_later_work` checks that accepted events precede the terminal departure and no later submission from that session succeeds.

This does not promise background completion: another state-dependent operation must drive retained work.
Dropping the entire runtime still requires backend settlement or recovery before replacement.

## Stale Durable Crash Controls

**Disposition: Superseded by removal of the old public controls.**

The [iteration 0015 correction](iterations/0015/phase-2/storage.md#notable-events) identified eight unreachable `SnapshotAfter*` controls and a reachable but misplaced `OpenAfterSnapshotRead` control.
The replacement [durable storage module](../crates/sea-file-durable/src/storage.rs) specializes the shared file engine; it no longer exposes `CrashPoint` or `CrashInjector`.
A search of current crates, packages, and tests finds none of those retired symbols.
The replacement `JournalFault` hooks are private, test-only, and reached by the partial-I/O regression above.
`snapshot_post_sync_ambiguity_recovers_without_duplicate_publication` in [file storage tests](../crates/sea-file/src/storage.rs) checks the current snapshot journal boundary.
There is no remaining obsolete public control to repair or deprecate.
This disposition does not establish power-loss or hardware-failure qualification.

## Browser Disconnect Resource Release

**Disposition: Still open for platform regression evidence; the original no-op is fixed.**

The [historical transport report](iterations/0015/phase-2/transport.md) required a browser fixture that distinguishes connection close from logical-stream close and observes resource release.
The current [browser transport](../crates/sea-webtransport/src/transport/browser.rs) calls `WebTransport.close()` from both `disconnect` and `Drop`, matching its [lifecycle contract](../crates/sea-webtransport/README.md#lifecycle-and-ownership).
The [browser harness](../tests/webtransport-browser/browser-test.mjs) closes logical sessions, rejects later requests, and opens fresh sessions.
Those assertions do not observe the old physical connection's release and could pass while that connection remains open.
No focused connection-release assertion was found in the tracked browser harness or TypeScript package tests.

The browser resource-release evidence gap was open at this reconciliation; [later focused regressions](AGENTIC_DEVELOPMENT.md#representative-outcomes) addressed it.
Close it with a real-browser regression that distinguishes logical close from transport disconnect and observes server cleanup or recovered capacity under a bounded deadline.
Keep explicit disconnect and final-owner drop distinguishable so the drop path cannot hide a broken disconnect implementation.

## Injected Disconnect Failure State

**Disposition: Still open in the generic Rust client; the old JavaScript injection surface is superseded.**

The [iteration 0015 finding](iterations/0015/phase-2/transport.md#contract-and-integration-friction) concerned logical state after a JavaScript disconnect hook throws.
Current tracked crates, packages, and tests no longer contain `SeaInjectedClient` or `call_optional_method`; the [transport crate](../crates/sea-webtransport/README.md#targets-and-generated-bindings) explicitly no longer owns JavaScript transport injection.
Ignored old generated bindings are not current API or validation evidence.

The underlying error-state question remains in [generic `Client::disconnect`](../crates/sea-webtransport/src/client/mod.rs).
It invokes the transport, marks state disconnected and clears authority/correlations, then returns the transport error.
Its documentation does not define the state after that error.
`disconnect_abandons_requests_and_requires_explicit_recovery` tests `ClientState` directly, while both local client test transports return successful disconnect results.
That test cannot detect a regression in the outer client's transport-error branch.

Retain the [generic disconnect error-state gap](../KNOWN_ISSUES.md#generic-client-disconnect-error-state-is-not-defined) with a consumer-driven trigger.
Resolve it by choosing the required error-state contract and adding a fallible transport test through `Client::disconnect`, not by promoting incidental behavior to a new promise during this reconciliation.

## Connection-Establishment Timeout

**Disposition: Resolved by implementation commit `ad362b66029`, merged at `9c510d094fc`.**

The [server contract](../crates/sea-webtransport-server/README.md) and [implementation](../crates/sea-webtransport-server/src/server.rs) now apply one deadline to incoming establishment, path rejection, and acceptance.
Failed admission cleans up its service without reconnect grace and returns normally to the listener, releasing the capacity slot.
Established-session I/O and idle behavior remain separate from the admission deadline.

The owning `server::tests` module provides four discriminating regressions:

- `failed_admissions_release_capacity_and_preserve_listener` exercises a stalled handshake, aborted handshake, rejected path, and successful connection with capacity one, then checks cleanup counts.
- `shutdown_cancels_pending_admission_without_reconnect_grace` checks immediate and zero-deadline drain cancellation of a pending admission.
- `idle_stream_outlives_operation_deadline` proves an idle established stream survives the operation deadline using virtual time.
- `partial_frame_expires_after_operation_deadline` proves a partial frame still times out using virtual time.

## Validation

All 15 selected Rust tests passed at the recorded source commit.
The documentation checker, scoped repository policy check, whitespace check, and 58 local link/anchor checks across the three changed documents passed.

Focused checks for this documentation-only reconciliation, run from `rust-service/`:

```bash
cargo test -p sea-file --all-features storage::tests::journal_faults_preserve_prefix_and_block_uncertain_observations -- --exact
cargo test -p sea-file --all-features storage::tests::snapshot_post_sync_ambiguity_recovers_without_duplicate_publication -- --exact
cargo test -p sea-sequencer --all-features fault_tests
cargo test -p sea-webtransport --all-features client::tests::disconnect_abandons_requests_and_requires_explicit_recovery -- --exact
cargo test -p sea-webtransport-server --all-features server::tests
node scripts/check-documentation.mjs
```

Repository-root validation also includes `pnpm policy-check --path rust-service` and `git diff --check`.
Local link targets and heading anchors in the new record and its index links are checked separately because the documentation checker does not validate anchors or this non-README record.
Current tracked-source searches establish removal of the old crash controls and JavaScript injection symbols; ignored generated files are excluded.
No production source, build input, dependency, or generated artifact changes are required.
The full workspace build and browser harness are not rerun for this reconciliation; neither would substitute for the missing focused browser resource-release assertion.