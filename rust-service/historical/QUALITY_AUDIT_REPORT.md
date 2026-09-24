# Rust Service Quality Audit

Status: complete within the approved audit budget; repository-wide build passed after the user's formatting fixes.
Recorded: 2026-09-24.

## Configuration

- Source: `0e02862c6af12a73dc062187ec945365365065ab`, initially clean working tree.
- Closeout revalidation: `bf45d36e9d80dcf7310a1659952f360a37621102` plus the retained audit diff.
  The user's intervening commits `7d99ea296d1` and `bf45d36e9d8` update benchmark JSON formatting and its generators; they do not change the audited Rust behavior.
- Mode: user-approved full reassessment of Rust-service responsibility boundaries, including unchanged and previously accepted behavior.
- Trigger: explicit user request for full reassessment.
- Budget: three risk-ranked boundaries and at most two cohesive repair clusters.
  Stop after those boundaries; record unresolved risks and ask before expanding.
- Inherited evidence: [iteration 0017](iterations/0017/quality-inventory.md), [deferral reconciliation](DEFERRAL_RECONCILIATION.md), and [known issues](../KNOWN_ISSUES.md).
  Prior dispositions are hypotheses, not reasons to skip eligible boundaries.
- Risk input: current contracts and changes since `41e9420cbba665bb4d9ad32f812eb1816a3fdea9`, especially the newly merged cache and recent native opening-stream fix.
  History ranks candidates but does not limit eligibility.
- Exclusions: broad rewrites, benchmark campaigns, infrastructure provisioning, and production or power-loss qualification.
- Validation: focused regression checks and applicable [canonical gates](../DEVELOPMENT.md#canonical-workspace-commands); no additional custom gates.
- Execution: sequential audit, no numbered iteration, independent review, commit, or push.

## Risk Map

1. **Shared cache invalidation and subscription isolation.**
   Independent storage failure must terminate cached reads rather than expose stale authority.
   The newly enabled built-in cache introduces callbacks and multiple ownership lifetimes.
2. **Cached historical-to-live handoff and progress.**
   Cursor, retention, and progress decisions can silently skip or duplicate application history, or starve delivery.
   This is distinct from terminal-state ownership.
3. **Native opening event-stream lifetime.**
   A recent benchmark fix consumes the stream returned by session opening instead of opening another read.
   The shared typed client owns this stream on both native and browser targets.
   Correct initial loading and continued delivery depend on transferring and consuming that stream rather than only request/response success.

These boundaries outrank unselected candidates because they combine broad consumer reliance, asynchronous ownership, and recent defects or new default behavior.
File recovery/checkpoint correctness, wrapper transformations, signals, server admission cleanup, browser physical release, and generic disconnect error-state semantics remain eligible but unreviewed within this budget.
Prior local file and signal evidence informs ranking without establishing current adequacy.
Historical transport deferrals require current inspection before claiming closure.

## Reviewed Boundaries

### shared-cache-invalidation-and-subscription-isolation

**Disposition: already adequate for the reviewed cache-consumer decisions.**

Owner: `LiveCache::terminate`, `remove`, and `close_session`, wired by `LocalSequencer::recover_inner` and observed by `Reader::next`.
Consumers: unbounded direct reads and load suffixes, including stalled subscribers.
The [cache contract](../crates/sea-sequencer/README.md#experimental-shared-live-cache) promises:
"Revocation synchronously removes only that subscription" and "Drop, membership close, shutdown, and independent backend invalidation remove ownership without another subscriber poll."
It also promises no automatic storage fallback or rejoin and no revocation of author authority or sibling subscriptions.
The [storage observer contract](../crates/sea-core/src/storage/ordered_archive.rs) requires synchronous callbacks and preserved backend error classification.

Hypothesis: cached reads could retain entries or silently continue after independent invalidation, or an old revocation could remove a replacement.
Inspection of the [cache owner](../crates/sea-sequencer/src/live_cache.rs), [reader](../crates/sea-sequencer/src/live_read.rs), and [focused tests](../crates/sea-sequencer/src/live_cache_tests.rs) found discriminating existing evidence:

- `independent_invalidation_releases_unpolled_claims_and_wakes_active_read` checks immediate registry/payload release before polling, a real waiter wake, original error classification, and no archive polls.
  Removing callback wiring, terminal fan-out, or the notification breaks these distinct assertions.
- `revocation_drop_close_and_stale_capabilities_reclaim_without_polling` checks identity-scoped removal, a surviving sibling claim, inert stale capabilities, membership closure, and continued author use.
- `recovery_never_retains_history_and_invalidated_openings_cannot_rejoin` checks sticky rejection for late readers and invalidated recovery.
- `snapshot_load_handoff_and_subscription_revocation_leave_publisher_and_author_intact` checks continued author and snapshot authority after subscription-only revocation.

These are owning-crate tests through the deterministic storage seam, not conformance proxies.
The separate core invalidation-source tests own callback registration races; their presence does not prove each real backend's invalidation trigger.
No change is needed for this boundary.
Revisit on callback wiring, terminal precedence, membership cleanup, or subscription identity changes.
Real backend failure detection and every concurrent schedule are not certified by this disposition.

### cached-historical-to-live-handoff-and-progress

**Disposition: already adequate for the reviewed cursor and frontier decisions.**

Owner: `Reader::next`, `Subscription::attach`, and `LiveReadStream::progress`.
Consumers: catch-up readers, direct live readers, and snapshot loads.
The [cache contract](../crates/sea-sequencer/README.md#experimental-shared-live-cache) states:
"Progress can precede buffered data and never advances that cursor."
It also states that a reclaimed handoff retries from the delivered cursor, without gaps or duplicates, and that delivery drains the discovered prefix before announcing a newer frontier.

Hypothesis: source progress could advance the handoff cursor, or new publication could repeatedly replace discovery and starve data.
The [focused tests](../crates/sea-sequencer/src/live_cache_tests.rs) directly discriminate these decisions:

- `historical_finite_load_and_missed_handoff_preserve_exact_delivered_cursor` observes a frontier before data, publishes and reclaims another event during finite replay, then checks each delivered position across retry and live attachment.
  It separately verifies finite reads still construct storage reads.
- `cached_progress_discovers_retained_and_new_frontiers_before_delivering_items` publishes again after discovery and requires the earlier item next, with the earlier frontier retained until drained.
- `historical_and_cached_backlogs_report_fallen_behind_without_inconsistent_snapshots` checks both discovery paths and the progress snapshot after each delivered position.

All run in the owning crate and localize cursor/frontier decisions without a server or browser.
Shared session conformance remains useful for substitutability, not as replacement evidence.
No new tests or contract prose are needed.
Revisit on cursor, replay bound, retention, progress, or cache-publication changes.

### typed-client-opening-load-ownership

**Disposition: repaired contract and owning-layer regression gap; no runtime behavior change.**

Owner: `SessionClient::load` in the [typed client](../crates/sea-webtransport/src/native.rs), shared by native and browser transports.
Consumers include the native presentation benchmark and remote session adapters.
Source-history inspection corrected the initial risk hypothesis: `b6bae55acfb` repaired the benchmark consumer, not the transport implementation.
Its direct `read` left the opening event stream undrained.

The [core load contract](../crates/sea-core/src/session.rs) promises selected state and a live suffix, but does not specify transport-opening ownership.
The existing transport role table described opening snapshot/catch-up/live delivery without telling typed callers how to consume it.
Added that responsibility to `SessionClient` documentation and the [lifecycle guide](../crates/sea-webtransport/README.md#lifecycle-and-ownership):
the first load matching the opening reference consumes the opening stream; a direct read is not a substitute.
This is consumer-relevant resource guidance, not a new generic `SeaArchive` requirement.

The pre-existing local test checked only response conversion.
`host::tests::native_client_round_trip_in_every_storage_mode` supplies useful real-QUIC/server/storage composition evidence and calls the matching load, but does not cover both reference policies and optional opening snapshots locally.
The new `native::tests::matching_load_consumes_opening_prefix_and_continues_live_without_another_stream` supplies exactly two logical streams.
It tests both opening reference policies with and without a snapshot, preserved initial progress and snapshot handles, continued event delivery after a pending receive, delivered-cursor progress, and transfer of stream ownership to the returned load.
Dropping the returned stream closes the fixture receiver while the client remains alive.
This is local ownership evidence, not proof of physical browser connection release.

A temporary mutation inverted the matching-policy branch.
The new test failed immediately with `load must reuse the opening stream`, proving that another content stream cannot satisfy the assertion.
The mutation was removed before validation.
Prequeued response checks use deterministic readiness assertions rather than sleeps or unbounded waits.
No changeset is needed for unchanged behavior, source documentation, and test evidence.
Revisit on opening policy, stream reuse, response-prefix conversion, or load ownership changes.

## Validation

- Initial formatting invocation from the repository root failed because it has no Cargo manifest; rerunning from `rust-service/` passed.
- VS Code test discovery found no Rust tests; Cargo is used for executable evidence.
- Focused Cargo checks initially passed: 2 typed-client tests and 18 cache tests.
- Focused Clippy found a test-helper argument passed unnecessarily by value and an oversized test.
  The helper now borrows its response, and opening setup is shared by the matrix cases.
- Mutation check: expected failure (exit 101), followed by restoration of the production branch.

Final validation on the retained documentation/test diff:

| Check | Result |
| --- | --- |
| `cargo fmt --all -- --check` | Passed. |
| `cargo clippy --workspace --all-targets --all-features -- -D warnings` | Passed, including the repaired test helper. |
| `RUSTDOCFLAGS='-D warnings' cargo doc --workspace --all-features --no-deps` | Passed, including new intra-doc links. |
| `cargo build --workspace --all-targets` | Passed. |
| `cargo test --workspace --all-targets --all-features` | Passed, including 23 transport tests, 63 sequencer tests, and 33 server-library tests; the browser-only test was ignored here and executed by the browser harness below. |
| `node scripts/check-documentation.mjs` | Passed initially and at closeout: 29 roots, 54 documents, 326 local links. |
| `pnpm policy-check --path rust-service` | Passed. |
| `pnpm build:fast` | Initially failed only in root `biome check .`: formatting of unchanged [native benchmark evidence](measurements/overview-refresh-20260923/native-webtransport-drain-fix.json). After the user's formatting commits, the closeout rerun passed in 70.789 seconds, including root Biome, policy, assert-tag validation, and integration test compilation. |
| `./rust-service/test.sh` | Package build and Rust workspace tests passed. Aggregate non-Rust tests failed in eight remote benchmark cases at connection opening; its separate real-browser task passed. |
| `CARGO_TARGET_DIR=/workspaces/FluidFramework/rust-service/target pnpm --dir rust-service/tests/sea-integration-tests run test:all` | Passed all ten tasks, including driver, tree, neutral TypeScript, integration Mocha, and real Chromium tests. |
| `git diff --check` | Passed. |

The aggregate failure was not dismissed as timing noise.
Cargo metadata reported `/workspaces/.cargo-target`, while `startRustService` in the [benchmark fixture](../tests/sea-integration-tests/src/test/sharedTree.bench.ts) launches `rust-service/target/release/sea-webtransport-server`.
The launched file was dated 2026-09-23 05:14 UTC; the actual Cargo output was dated 2026-09-24 00:11 UTC.
Aligning Cargo output with the launch path rebuilt the executable used by the runner and made the aggregate pass without source changes.
This supplies a local validation workaround, not a persistent repair to artifact selection.
The initial eight failures and the failing root build remain recorded rather than replaced by the successful rerun.
The later root-build rerun closes the formatting blocker.
Rust and aggregate-test results above are from the initial audit validation; those suites were not repeated for the user's JSON-formatting-only changes.
The real-browser output includes successful explicit-disconnect and final-owner-drop physical-release evidence; no full semantic re-audit of that unselected boundary is claimed.

## Remaining Risks And Convergence

Three boundaries were reviewed out of the full eligible scope, using one of the two permitted repair clusters.
The inherited inventory predates the current cache implementation; this run establishes current local evidence rather than inheriting its acceptance.
It closes a consumer-facing documentation and owning-test gap without duplicating the cache tests.
No runtime defect was confirmed.

Unreviewed candidates remain unreviewed, not adequate or excluded:

- File recovery, checkpoint persistence, and worker cancellation: storage owner; revisit on checkpoint/worker changes or an I/O incident.
- Wrapper transformations and signals: owning crates; revisit on composition or routing changes, or a targeted reassessment.
- Admission cleanup, generic disconnect errors, and physical browser release: transport owners; recheck current tests and contracts before reconciling historical deferrals.
  The current transport README advertises physical-release browser regressions added after iteration 0017, so its old deferral cannot simply be restated as a current gap.
- Benchmark executable selection: integration-harness owner; follow up when running with a configured Cargo target directory.
  Building and launching must use the same artifact location; the current hard-coded launch path can run stale protocol code.
  This validation-discovered tooling gap is deferred outside the three-boundary audit, with the explicit environment workaround above.

The earlier repository-formatting blocker is resolved by the user's commits and the successful root-build rerun.

Stop at the approved three-boundary budget.
This bounded reassessment is not exhaustive and provides no evidence that every historical deferral remains open or has been closed.
Another broad run is not justified solely to add tests; any next run should target changed ownership, a concrete unresolved finding, or a user-approved reassessment.
