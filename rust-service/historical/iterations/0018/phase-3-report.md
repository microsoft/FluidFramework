# Iteration 0018 Phase 3 Report

Status: complete
Phase 2 integration commit: `b2dfd05097d74fc293f0d296ae94cac70bf34ac0`; validated implementation is `314248a7fb6d7896043df4a345b7c25ac992aa4e`.
Phase 3 commit: the commit containing this completed report; its own hash is not embedded recursively.

## Evidence Summary

The [charter](charter.md) authorized full reassessment of every Rust workspace member, including unchanged and previously accepted code, without a review-count or time cutoff.
All 15 members have refined responsibility maps and evidence in five workstream reports.
The [inventory](quality-inventory.md) reconciles 130 boundaries, including the two consumer follow-ups discovered during integrated validation.
Risk ordered the work; no lower-risk member was silently omitted.

The audit found material localized defects and contract/test gaps, not merely declaration-documentation gaps.
Accepted no-change rows identify existing owning decisions and tests; explicit exclusions distinguish trivial forwarding, trait-only surfaces, and campaign-level qualifications from missing coverage.
The [integration report](phase-2/integration.md) contains the exact source/integrated commit map, failed attempts, fresh passing gates, and independent-review identity/coverage.
[Execution evidence](execution-evidence.json) preserves five attributable native/full/build runs, including both initial failures.
Final platform output includes 13 passing browser records and explicit lifetime, physical-release, and snapshot-registration observations.

## Implementation Defects

- Core boxed streams now normalize latest-known/backlog progress when delivering values; sequencer lazy storage reads separately retain synchronous backend progress across opening and membership-only closure.
- Content publication only removes staging files owned by its attempt, synchronizes fresh/existing/racing publication, durably initializes namespace ancestry, and distinguishes missing roots from corrupt descendants consistently.
- Completed file streams retain source ownership until drop without dispatching unnecessary further reads.
- Sequencer admission and signal fanout compact retained byte backing after admission, rather than bounding only visible payload length.
- Typed protocol decoders reject trailing bytes; author receipts must match the request before stream reuse; content EOF requires explicit completion.
- Server content reads react to peer receive cancellation while idle; snapshot pumps explicitly cancel portable stream directions.
- Browser establishment and final stream-clone ownership now close/cancel resources and release JavaScript locks; disconnected datagram operations reject even if physical close failed.
- Benchmark consumers use actual positions, verify final snapshot identity/content, and count persisted files recursively.
- Harness build/launch paths share one explicit Cargo target, and evaluation waits for the exact requested document's readiness.

Owning tests and documentation were added or corrected for these decisions.
Other additions close localized evidence gaps without changing existing behavior; their reports distinguish those cases.

## Shared Abstraction Findings

Supported: an exhausted wrapper can still own a backend capability; allocation retention is not equivalent to payload length; portable cancellation is not equivalent to dropping a generic handle; and a wire identity is not an availability capability.
These required localized ownership/progress/evidence repairs rather than new crate boundaries.

The user confirmed that snapshots may reference any committed session event, including membership events; application-only wording was inaccurate.
The user selected constructor-owned durable content namespaces and conservative logical abandonment after physical disconnect failure.
Cross-incarnation authority binding and native post-opening deadlines remain separate design limitations, not hidden implementation successes.

The historical claim that browser physical-release evidence lacked a fixture was rejected after locating and actually executing the existing fixture with new ownership probes.
Shared-target artifact reuse and exact causality of the original Chromium context-destruction incident remain inconclusive.

## Decisions

- [0021: Content namespace durability](../../decisions/0021-content-namespace-durability.md): accepted bottom-up constructor synchronization within the namespace filesystem.
- [0022: Session snapshot positions](../../decisions/0022-session-snapshot-positions.md): accepted membership-inclusive positions, preserving existing behavior.
- [0023: Defer stream incarnation binding](../../decisions/0023-defer-stream-incarnation-binding.md): user-deferred reproduced stale-author bug; retain the ignored failing reproducer and known limitation.
- [0024: Disconnect error state](../../decisions/0024-disconnect-error-state.md): accepted logical authority/correlation abandonment despite physical close errors, with explicit recovery.
- [0025: Native timeout scope](../../decisions/0025-native-timeout-scope.md): accepted accurate opening-only timeout documentation; native post-opening enforcement deferred.

## Comparative Results

Native production source is unchanged after integrated transport commit `415077e9f82`; subsequent implementation commits affect TypeScript/browser harnesses only.
No manifests, dependencies, or shared lockfiles changed.
New adapters and RAII states make previously lost ownership/progress explicit; tests exercise the exact obligations rather than adding a new public abstraction.
Byte compaction bounds retained backing at the cost of a copy; no throughput, allocation-rate, RSS, or durability-performance improvement is claimed.
Benchmark correctness cases are not a benchmark campaign.
The stored test/build durations describe these runs only and do not establish a speedup over earlier iterations.

## Contract and Test Quality

Core publication tests use permissive dependencies so lower-layer checks cannot mask a missing view-level decision.
File ownership and retained-allocation tests observe capability/backing lifetimes, not indirect success counts.
Sequencer progress tests distinguish its source-preservation responsibility from core delivery normalization.
Framing, receipt correlation, datagram filtering, and snapshot cancellation each have focused owner-local checks.
Shared conformance retains implementation-independent laws; composition tests establish actual hop paths and independent expected plaintext.
Raw generated tests bypass TypeScript validation; real Chromium tests prove JavaScript API, lock, transport-capacity, and registration lifetime that native tests cannot establish.
Controlled CDP events test readiness without a probabilistic navigation sleep.

Independent standard-depth reviewers received complete fixed-base diffs and baseline/current source, not only implementer summaries.
Foundations/persistence and sessions reviews completed with no actionable findings.
Transport/consumers initially completed changed-file review but explicitly left some unchanged-boundary evidence unfinished; the coordinator required completion rather than accepting sampled coverage.
The continuation completed those groups and reported no remaining assigned review gaps or actionable findings.
All three complete fixed-base source-diff hashes were revalidated against the current implementation, and their union accounts for all 70 changed implementation/test/guide files.
The coordinator verified inventory link rebasing, all five owner tables, 130 distinct boundary rows, and inclusion of the two reopened consumer repairs.
Historical report phrases such as “pending generated validation” are superseded only by the matching fresh integration evidence, not by native pass counts.

## Learning and Process Findings

The [retrospective](retrospective.md) records the stalled optional mutation, isolated-target provenance concern, delayed fixture messages, dependency restoration, accidental broad Mocha selection, browser readiness gap, and root-only format failure.
The [learning index](../../LEARNINGS.md) adds observed allocation-backing, document-readiness, and environment-specific task/provenance lessons.
Each accepted semantic choice has a decision record; no unsupported total overhead, model, token, or throughput estimate is supplied.

## Skill Changes

The [skill review](skill-review.md) retains current quality/coordination/checkpoint guidance without a new skill or policy expansion.
Existing rules already require actual delegate discovery, execution provenance, local discriminating tests, and repository/platform gates.
Per-workstream output targets and frozen fixture handoffs are local applications of those rules.
No general terminal fix or independent cancellation guarantee is claimed.

## Next Iteration Scope

No next iteration is approved; `nextWorkstreams` remains empty.
Keep the accepted repairs and focused evidence; stop this full reassessment after required review and record checks.
Revisit stale-stream authority only with an explicitly approved incarnation-binding design, and native frame deadlines when bounded post-opening behavior is required.
Changed ownership/contract boundaries, concrete incidents, or an explicit reassessment request are valid future triggers.
Do not repeat unchanged work solely to increase test or documentation volume.

## Convergence Assessment

This reassessment has a valid explicit trigger and covers every selected member, including no-change results.
It reduces material local risk and retains precise evidence; it does not assert that every defect was found.
Two known design/repair deferrals are explicit user decisions, not unreviewed areas.
The optional mutation, cache provenance question, original browser incident, performance campaigns, and power-loss qualification remain accurately limited.
Canonical native gates, scoped policy, fresh complete generated/Node/browser execution, and the repository build passed.
All independent review scopes are complete, with no unresolved blocking finding and no requested runtime reproduction.
Final record validators and clean primary-branch delivery close this iteration; no next run is automatically authorized.

The Phase 2 record and quality validators passed before its acceptance commit.
Final Phase 2, complete-record, and quality-inventory validators all passed, as did documentation links, scoped policy, metadata formatting, whitespace, and shared-lockfile checks.
The five owned workstream checkouts were removed only after confirming clean status and retaining their source branches and integrated commit map.
The late persistence note was committed and integrated rather than discarded.
All temporary task registrations are removed, the primary task file matches its original contents, and no assigned task runner remains active.
The final delivery uses a fast-forward to the primary `rust-service` branch without touching unrelated worktrees or pushing.
