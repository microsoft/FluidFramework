# Iteration 0015 Phase 3 Report

Status: complete
Phase 2 integration commit: `76a8526a42abd645e2d6d3fc2d32bbfb53ffc6ad`
Phase 3 commit: not created; completion was requested without a commit

## Evidence Summary

Iteration `0015` challenged every inherited iteration `0014` disposition under
the exact-owning-decision rule. The reconciled [quality inventory](quality-inventory.md)
contains 48 rows: 9 repaired, 33 already adequate, and 6 deferred. The repeat
found material evidence gaps in all five ownership groups while staying within
the two-cluster limit for each workstream.

The charter hypotheses were supported. Exact decision discrimination exposed
tests that could pass while local mappings, transitions, parser calls, recovery
oracles, and connection-local behavior regressed. Every accepted repair was a
focused test or documentation adjustment for existing behavior. Integration
added only behavior-preserving compilation, synchronization, formatting, and
lint fixes.

Focused checks, strict package Rust gates, canonical workspace gates,
`./test.sh`, policy, `pnpm build:fast`, benchmark smoke, `sea-counter`, and the
documentation checker passed. Independent integrated-diff review found no
blockers and corrected the durable crash-point evidence retained in the
inventory.

## Implementation Defects

None. The nine repairs close regression-evidence gaps for behavior that the
current implementations already provided. There were no production behavior,
public API, wire or persistence format, dependency, manifest, or lockfile
changes.

## Shared Abstraction Findings

Supported: naming an exact owning decision and a test that eventually fails is
necessary but not sufficient. Precise contract text and practical owner-local
diagnostic evidence are independent requirements. Shared conformance remains
valuable for implementation-independent laws, but it does not automatically
diagnose the responsible implementation locally.

Corrected: the durable crash-control evidence inherited from iteration `0014`
was stale. `OpenAfterSnapshotRead` is reachable but semantically misplaced,
while all eight `SnapshotAfter*` variants are unreachable. This remains deferred
pending API or persistence-architecture authority.

Inconclusive: the six deferred boundaries still require a fault seam, consumer
contract, architecture authority, or platform fixture. No shared semantic
choice was made.

## Decisions

No shared semantic decision record was created. The accepted process refinement
changes evidence acceptance, not product semantics. The six product questions
remain deferred under their inventory triggers.

## Comparative Results

Compared with iteration `0014`, this repeat reconciled all 47 inherited rows,
added one deferred transport contract question, and repaired nine evidence gaps
without production churn. Dependencies, formats, APIs, workloads, and measured
algorithms were unchanged, so no size or performance comparison is applicable.
Benchmark smoke was a correctness gate rather than a performance measurement.

## Contract and Test Quality

The nine repaired rows now have focused owning-crate evidence for sequencer error
mapping and reference release, file rejection atomicity, stateful frame
consumption, protocol decoder calls, same-connection stream isolation, reopened
benchmark integrity, and counter snapshot behavior. Existing contracts already
state those guarantees; no duplicate contract prose was added.

The 33 adequate rows name an exact decision and nearest discriminating test or
give a structural reason that narrower evidence is not meaningful. Conformance
is credited only for shared laws, while integration, generated, executable, and
platform tests retain distinct boundary responsibilities. No accepted repair
relies only on broad evidence, and the six unsupported boundaries remain
deferred rather than being overstated.

Post-boundary review nevertheless found a reusable limitation: reports must
quote or link precise contract text and separately assess whether a failure
diagnoses the implementation owner locally. An eventual shared-conformance
failure alone does not satisfy the second requirement when a practical focused
test exists.

## Learning and Process Findings

The [retrospective](retrospective.md) records repeated command routing and cold
build interruptions, strict integration failures and repairs, and a repeated
report-template append defect. The existing
[durable lesson](../../../LEARNINGS.md#correctness-and-testing) now includes precise
contract traceability and owner-local diagnosis alongside exact decision
discrimination.

The append defect occurred in iteration `0014` `sea-core` and iteration `0015`
`core-session`: a completed report was immediately followed by another complete
64-line template. The reusable validator now rejects validated Markdown records
that contain more than one top-level heading.

## Skill Changes

The [skill review](skill-review.md) accepts contract-text traceability and
diagnostic locality in the quality skill and the workstream, integration, and
Phase 3 templates. It also accepts the generic duplicate-top-level-heading
record validation described above. No new skill or product decision record was
needed.

## Next Iteration Scope

Iteration `0016` has one neutral `contract-locality` workstream. It independently
challenges all 33 inherited adequate rows under the refined contract-text and
owner-local-diagnosis rule, with at most two unrelated repair clusters. It may
clarify existing contracts and add focused tests but may not change shared
semantics, APIs, formats, dependencies, manifests, or lockfiles.

The six current deferred findings retain their existing triggers and are not
separate workstreams. No additional ownership group or shared semantic decision
work is approved.

## Convergence Assessment

The general post-boundary process evaluation concluded that the run met the
agreed quality threshold. It found no blocker in the accepted repairs and no
unrelated production churn. Private cases and scoring are intentionally not
recorded here.

Convergence is not established. This repeat found material new evidence gaps,
so a further neutral run is justified despite the 33 adequate dispositions.
Iteration `0016` tests the remaining process hypothesis: whether explicit
contract traceability and owner-local diagnosis expose further material gaps.
Convergence requires that bounded repeat to find no material new deficiency.
