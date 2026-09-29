# Iteration 0020 Rust Quality Inventory

Status: complete
Source commit: `8a3889518d537d6a85bd55cc31a1b7404eee78e7`
Review mode: Incremental since `8bd1e64ebfa`.
Configured scope: All 15 members; exclusions and ownership in the [charter](charter.md).
Reassessment trigger: Subsequent changes and applicable recorded revisit triggers.
Inherited inventory: [0018](../0018/quality-inventory.md), [sequential audit](../../QUALITY_AUDIT_REPORT.md), and [0019 simplification](../0019/manifest.json).
Coverage commitment: Full incremental scope, using the [crate map](charter.md#active-workstreams).
Budget and stopping conditions: No review cutoff; estimate 20-30 boundaries and several hours plus validation. Repair all localized gaps; escalate redesigns and shared semantics without truncating review.

## Selection Rationale

New document-wide policy, pressure, typed hosting, and author pipelining affect resource lifetime, cancellation, and publication authority.
They lead review without excluding lower-ranked changed boundaries.
The charter assigns every member; workstream reports distinguish reviewed changes, unchanged evidence, and unresolved triggers.

## Reviewed Boundaries

This inventory indexes the stable boundary rows in the linked workstream reports.
Each report row supplies the precise contract links/quotes, owner and consumers, exact owning decision, named test discriminators, and diagnostic-layer assessment.
Those details are retained once rather than duplicated here.
The [integration report](phase-2/integration.md) records frozen patch identities, source-to-integrated commit mappings, and directly verified validation.
Unless a row names a narrower trigger, revisit when its contract, owning decision, or discriminating evidence changes.

### Foundations

Evidence: [foundations contract tables](phase-2/foundations.md#behavioral-contracts-and-test-layers).
Validation: [153 passing tests and strict checks](phase-2/foundations.md#validation-evidence).
All five assigned members are accounted for in its member map.

| Boundary | Disposition | Owning decision or repaired evidence | Report |
| --- | --- | --- | --- |
| foundations-core-content-codec | already adequate | Canonical encoding, unchecked encoded-byte hashing, validation precedence | [core](phase-2/foundations.md#core) |
| foundations-core-values | already adequate | Position byte order and nonzero identities | [core](phase-2/foundations.md#core) |
| foundations-core-stream-adapters | already adequate | Pinning, source/transform errors, delivery progress | [core](phase-2/foundations.md#core) |
| foundations-core-invalidation | already adequate | Sticky cause, synchronous callbacks outside locks, registration lifetime | [core](phase-2/foundations.md#core) |
| foundations-core-view | already adequate | Dependency checks before permissive backend publication and batch-prefix handling | [core](phase-2/foundations.md#core) |
| foundations-core-declaration-forwarding | excluded | Unchanged trait relocation and trivial optional view mapping add no independent policy | [core](phase-2/foundations.md#core) |
| foundations-factory-pass-through | already adequate | Concrete handles, identical source futures, no extra lifetime owner | [core](phase-2/foundations.md#core) |
| foundations-policy-session-and-reader-admission | already adequate | Refuse before source, reader permit spans pending load, bounded-read bypass | [core](phase-2/foundations.md#core) |
| foundations-policy-write-admission-and-order | already adequate | Policy/source admission handoff and cancellation ordering | [core](phase-2/foundations.md#core) |
| foundations-policy-control-and-errors | already adequate | Control bypass and source-error preservation | [core](phase-2/foundations.md#core) |
| foundations-policy-stream-termination | repaired | `stream_end_releases_source_and_reader_permit_and_preserves_final_progress` | [core](phase-2/foundations.md#core) |
| foundations-policy-construction-docs | repaired | Correct default-on executable versus explicit direct/embedded composition | [core](phase-2/foundations.md#core) |
| foundations-file-pressure-reservations | already adequate | Real preparation/mutation permits retain charges through worker completion | [file](phase-2/foundations.md#file-storage) |
| foundations-file-pressure-waits | repaired | `wait_below_checks_each_dimension_and_stage_inclusively` | [file](phase-2/foundations.md#file-storage) |
| foundations-file-pressure-terminal | repaired | Actual notification before repoll in `termination_wakes_waiters_and_remains_sticky_after_release` | [file](phase-2/foundations.md#file-storage) |
| foundations-file-pressure-opening-lifetime | already adequate | Observer does not retain or follow replacement opening | [file](phase-2/foundations.md#file-storage) |
| foundations-file-publication-and-batches | already adequate | Durable/buffered publication fences and potentially attempted batch ambiguity | [file](phase-2/foundations.md#file-storage) |
| foundations-file-cursor-recovery | already adequate | Cursor settlement, incomplete-tail repair, lazy historical recovery | [file](phase-2/foundations.md#file-storage) |
| foundations-file-semantic-recovery | already adequate | Validly framed records must also satisfy identity, predecessor, and closure | [file](phase-2/foundations.md#file-storage) |
| foundations-file-snapshot-index | already adequate | Fixed-width arithmetic and measured logarithmic sparse lookup | [file](phase-2/foundations.md#file-storage) |
| foundations-file-content-availability | already adequate | Content closure, existing-directory fast path, failed sync publication fence | [file](phase-2/foundations.md#file-storage) |
| foundations-file-checkpoints | repaired | `empty_checkpoints_reject_before_worker_dispatch_without_replacing_state` | [file](phase-2/foundations.md#file-storage) |
| foundations-file-executor-and-read-preservation | already adequate | Accepted-work ownership, lazy reads, and shutdown/reopen preservation | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-memory-ownership | already adequate | Registry transfer, exclusivity, shutdown and retained reader ownership | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-memory-publication-and-recovery | already adequate | Dependency closure, capability provenance, sparse snapshots and reopen | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-memory-read-contracts | already adequate | Bounds, progress, sparse positions and reader notification lifetime | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-content-encoded-identity | already adequate | Reuse validated encoded identity without losing limits or precedence | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-content-publication-and-closure | already adequate | Immutable publication, transitive closure, provenance and synchronization | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |
| foundations-conformance-oracle-scope | already adequate | Shared laws remain implementation-independent, not owner-local fault tests | [report](phase-2/foundations.md#behavioral-contracts-and-test-layers) |

### Sessions

Evidence: [sessions boundary dispositions](phase-2/sessions.md#boundary-dispositions), including precise contract text and local test names.
Validation: [118 unit tests, one doctest, and strict checks](phase-2/sessions.md#validation-evidence).
All four assigned members are accounted for; the two additional prose dispositions below are also included.

| Boundary | Disposition | Owning decision or repaired evidence | Report |
| --- | --- | --- | --- |
| sequencer-factory-allocation | already adequate | Factory creation/cloning allocates no membership; opening preserves reference and ID | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-factory-facet-composition | already adequate | Concrete handles, facets, independent close and explicit lifetime | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-admission-order-and-prefix | already adequate | First-poll order, bounded waits, accepted prefix and cancellation | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-admission-bounds-and-backing | already adequate | Entry/byte charging, compact backing and commit-before-receipt | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-retained-work-and-terminal-prefix | already adequate | Retain original future, never resubmit, settle before terminal leave | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-recovery-cache-termination | repaired | `failed_reconciliation_terminates_cache_pressure_and_unpolled_retention` | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-checkpoint-and-reservation | already adequate | Checkpoint cadence/poison, reserve before exposing IDs, restart skip | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-codec-replay-and-membership | already adequate | Malformed metadata rejection and exact replayed membership departures | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-reference-floor | already adequate | Committed monotonic floor, opaque positions and final batch advancement | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-snapshot-authority-and-lineage | already adequate | Parent/root retry, nomination, checked fresh fences, stale-lease isolation | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-snapshot-settlement | already adequate | Exact lookup resolves ambiguity; admitted publication survives revocation | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-storage-read-lifetime | repaired | Initialized finite-read assertions in `direct_reads_close_with_membership_and_load_policies_preserve_replay` | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-maintained-ownership-accounting | already adequate | Maintained counters, exact backing and last-claim reclamation | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-pressure-thresholds-and-waits | already adequate | Inclusive below/strict above predicates and actual independent wakeups | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-pressure-weak-lifetime-and-terminal | already adequate | Observer cannot retain cache; terminal failure is not pressure relief | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-oldest-reader-shedding | repaired | `lagged_shedding_selects_the_oldest_unread_cursor_not_registration_order` | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-subscription-isolation-and-close | repaired | Never-polled registration assertions in `revocation_drop_close_and_stale_capabilities_reclaim_without_polling` | [sessions](phase-2/sessions.md#boundary-dispositions) |
| cache-publication-handoff-progress-and-driving | already adequate | Commit-only publication, delivered cursor, progress and retained-work wake transfer | [sessions](phase-2/sessions.md#boundary-dispositions) |
| signals-receive-conflict | already adequate | Single pending receive, safe cancellation, close wake | [sessions](phase-2/sessions.md#boundary-dispositions) |
| signals-document-isolation-and-test-consolidation | rejected | Removed weaker assertion is subsumed by retained same-identity cross-room matrix | [sessions](phase-2/sessions.md#boundary-dispositions) |
| compression-transform-contract-relocation | already adequate | Transformed payloads versus visible metadata, source errors and handles | [sessions](phase-2/sessions.md#boundary-dispositions) |
| encryption-envelope-and-lookup | already adequate | Authenticated key identity/context, parsing, missing-key and nonce errors | [sessions](phase-2/sessions.md#boundary-dispositions) |
| encryption-transform-and-forwarding | already adequate | Ciphertext identity, control metadata, snapshot and error forwarding | [sessions](phase-2/sessions.md#boundary-dispositions) |
| encryption-fifo-and-pre-admission-cancellation | repaired | `cancelled_gate_waiter_preserves_authority_and_does_not_encrypt` | [sessions](phase-2/sessions.md#boundary-dispositions) |
| encryption-admitted-terminal-and-recovery | already adequate | Admitted cancellation/failure terminalizes clones without hidden retry | [sessions](phase-2/sessions.md#boundary-dispositions) |
| sequencer-content-facade-and-dependencies | already adequate | `content_facade_resolves_stored_identities_and_requires_live_membership` and permissive-backend dependency rejection | [sessions](phase-2/sessions.md#behavioral-contracts-and-test-layers) |
| cache-independent-invalidation | already adequate | `independent_invalidation_releases_unpolled_claims_and_wakes_active_read` isolates backend callback wiring | [sessions](phase-2/sessions.md#behavioral-contracts-and-test-layers) |

### Consumers

Evidence: [consumer dispositions](phase-2/consumers.md#reviewed-boundary-dispositions).
Validation: [61 passing tests and strict checks](phase-2/consumers.md#validation-evidence).
All four assigned members are accounted for.
Generated/platform evidence remains subject to final integration execution.

| Boundary | Disposition | Owning decision or repaired evidence | Report |
| --- | --- | --- | --- |
| consumers-closed-loop-admission | repaired | Actual writer acknowledgment pacing, first-failure stop, cap, deadline and reader-error tests | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-streamed-production | repaired | Actual writer capacity, no-receipt progress, complete frames and partial-write failure tests | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-streamed-receipts | repaired | Duplicate/descending receipt rejection leaves counters unchanged | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-completion-windows | already adequate | Half-open acknowledgment/read completion windows and recipient-specific counts | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-shedding-and-drain | already adequate | Only explicit revocation sheds; missing active reads or acknowledgments prevent success | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-streamed-protocol-and-cleanup | excluded | Shared codec/TLS/transport are separately owned; writer and receipt decisions are covered above | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-factory-churn-verification | repaired | `finite_replay_rejects_wrong_identity_payload_kind_and_additional_history` | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-no-reader-factory-composition | already adequate | Returned factory identity and exact replay verification | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-general-benchmark-accounting | already adequate | Exact payload/count/snapshot verification and unchanged timing definitions | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-pipeline-clock-contracts | already adequate | Final-flush timing and integer anchored clock arithmetic | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| wasm-availability-erasure | already adequate | Incompatible concrete handles reject before publication; classification preserved | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| wasm-generated-values-and-ownership | already adequate | Raw binding malformed input, pending-read cancellation and owned-signal lifetime evidence | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-typed-network-factory | already adequate | `network_factory_opens_independent_sessions_and_forwards_facets` proves real adapter composition | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-composition-rebuild | already adequate | Twelve concrete stack configurations retain independent rebuilt-stack laws | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |
| consumers-counter-recovery | already adequate | Six focused example tests preserve signed values, snapshot replacement and replay suffix | [consumers](phase-2/consumers.md#reviewed-boundary-dispositions) |

### Transport

Evidence: [transport contract tables](phase-2/transport.md#behavioral-contracts-and-test-layers).
The report accounts for both members and applicable inherited deferrals.
The user-deferred API proposal was removed before acceptance.
The revised five-path handoff passed all transport checks and is integrated as `2e6d36a0b7cc798bb06d69566243db2bf192a4a4`.

| Boundary | Disposition | Owning decision or evidence | Report |
| --- | --- | --- | --- |
| transport/typed-host-composition | already adequate | Decorate once before membership; shared factory and explicit embedded defaults | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| transport/typed-storage-setup | already adequate | Namespace recipes, concrete handles, pressure capability and reopening | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| server/registry-and-worker-ownership | already adequate | Off-executor retained initialization, retryable failure, shared runtime identity | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| transport/typed-host-lifecycle | repaired | `unused_lifecycle_operations_do_not_initialize_storage` | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| transport/typed-host-errors | already adequate | Initialization versus document-worker ambiguity stays typed | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| transport/executable-defaults | already adequate | Strict defaults, boolean/limit validation and incompatible combinations | [transport](phase-2/transport.md#typed-host-and-executable-configuration) |
| transport/policy-input-accounting | repaired | `every_write_kind_reserves_its_logical_bytes_before_source_admission` | [transport](phase-2/transport.md#resource-policy) |
| transport/policy-live-reader-scope | already adequate | Document-wide reservations and refusal before cache registration | [transport](phase-2/transport.md#resource-policy) |
| transport/policy-durable-readiness | already adequate | Wait/terminal classification and permit ownership; file owns budget conjunction | [transport](phase-2/transport.md#resource-policy) |
| transport/policy-output-admission-and-shedding | repaired | Exact entry/byte target admission; byte-only refusal and permit accounting with monitor disabled; independently retained background-shedding tests | [transport](phase-2/transport.md#resource-policy) |
| transport/author-pipeline-order-and-bounds | repaired | Correct stale sequential-author prose; scripted service already protects receive/receipt order and both limits | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/author-pipeline-barriers-and-failure | already adequate | Drain before controls/EOF; cancel pending receipts on errors without resetting frame deadline | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| server/event-authority-incarnation | already adequate | Bound dispatcher/cleanup never retargets replacement; prior deferral superseded by implemented and tested fix | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/protocol-adapter-conversion | already adequate | Typed role conversion, dependency checks, malformed input and shared policy owner | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/protocol-signal-ownership | already adequate | Existing document and one signal registration per physical connection | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/connection-scheduling-and-cleanup | already adequate | Distinct task IDs, joined cancellation, exactly-once cleanup and panic propagation | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/response-scheduling-fairness | already adequate | `ready_responses_yield_to_other_work` isolates cooperative budget consumption | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| server/framed-io-and-idle-cancellation | already adequate | Server admission/partial-frame deadlines versus idle subscriptions and peer stop | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/udp-receive-buffer | excluded | Effective kernel size is platform-selected; no portable exact-size oracle or approved performance campaign | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/websocket-listener-and-byte-adapter | already adequate | Origin/subprotocol/owner-child lifetime; browser backpressure remains platform evidence | [transport](phase-2/transport.md#server-protocol-scheduling-and-stream-ownership) |
| transport/native-timeout-ownership | already adequate | Controlled deadlines and real QUIC reset recheck the implemented prior deferral | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/timeout-cleanup-classification | deferred | Confirmed cleanup error can hide ambiguous timeout; user deferred new Rust variants and fix in [Decision 0030](../../decisions/0030-defer-compound-client-errors.md) | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/finite-completion-and-subscription-lifetime | already adequate | Finite completion deadline, idle subscriptions, buffered frames and protocol close ACK | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/native-submit-first-poll-order | already adequate | FIFO reservation despite exhausted cooperative budget | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/remote-session-factory | repaired | `opens_forward_document_and_reference_on_independent_connections` uses a scripted peer without a host masking choices | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/wire-codec-preservation | already adequate | Exact bounded frame lengths, varint cases and payload consumption | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |
| transport/browser-private-helper-preservation | already adequate | Identical helper move/rename; generated lifecycle and physical release remain final platform gates | [transport](phase-2/transport.md#shared-client-and-wire-contracts) |

### Coordinator Documentation

| Boundary | Disposition | Contract and evidence | Validation and revisit trigger |
| --- | --- | --- | --- |
| architecture-current-composition | repaired | [Architecture](../../../SEA_ARCHITECTURE.md) and [workspace graph](../../../WORKSPACE_ARCHITECTURE.md) now match worker-verified owning contracts and manifests: typed hosting, executable versus embedded policy, combined file crate, snapshot index, visible transform metadata, and current overview links | Documentation/local-link checks; revisit on crate topology, ownership, defaults, or overview replacement |

## Deferred Candidates

No approved review area was dropped because of effort or repair budget.
The source handoffs account for all 15 members; validation is complete with an explicit native-timeout exception, and fresh independent repair review found no actionable findings.
The confirmed timeout-cleanup defect was reviewed, experimentally repaired, then explicitly deferred by the user before integration because the proposal changes public Rust error enums.
The transport owner should revisit when an error representation/API migration is approved or a consumer requires classification under failed cleanup.
The [known native opening timeout](../../../KNOWN_ISSUES.md#intermittent-native-connection-timeout) recurred without attribution; capture failing-stage and worker timing on recurrence.
Production authentication, retention/GC, power-cut qualification, deployment provisioning and timed benchmark campaigns remain explicit exclusions or unchanged limitations, not adequate-test claims.

## Coverage Layer Review

Repairs target owning decisions that previous topical tests could miss: actual writer loops rather than helper calls, independent pressure dimensions, a choice among multiple eligible readers, real wakeups before repolling, and caller wiring rather than direct terminal injection.
Conformance remains shared substitutability evidence.
The scripted remote-factory peer isolates factory decisions; the retained real-host composition matrix covers rejection, history, handles and decorators.
Generated bindings and browser suites remain required for platform ownership and transport behavior that native tests cannot establish.
No line-coverage target, declaration census, or performance campaign was used.

## Convergence Assessment

Integrated validation passed before review; the added byte-admission test passed focused green/red/restored-green checks and complete serialized server validation.
The user accepted the recurring native-opening timeout as an explicit validation exception, not a resolved defect.
Initial independent review covered all changed files and audit dispositions and found one localized admission-evidence gap.
Fresh repair review accepted the new test and evidence with no actionable findings.
The coordinator reverified the complete reviewed snapshot before acceptance.
The broader incremental change window required 98 workstream boundary rows plus one coordinator documentation boundary, exceeding the initial estimate without imposing a cutoff.
Two inherited transport deferrals now have implemented, discriminating evidence; one newly confirmed classification defect remains under an explicit repair deferral.
Another broad audit is not justified merely to revisit accepted unchanged boundaries.
Any follow-up should target the deferred error representation or newly observed changes/incidents.
