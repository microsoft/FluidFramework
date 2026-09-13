# Iteration 0010 Phase 3 Report

Status: complete
Phase 2 integration commit: `7dfcdf9ec3c56b35fbf5b5801c2764a859c8a997`
Phase 3 commit: pending final Phase 3 record commit

## Evidence Summary

The fixed-size SharedTree hypothesis was supported: every measured edit replaced
one numeric field, state shape remained constant, and all 48 retained samples
converged to the expected final scalar. The independent event-accounting
hypothesis was falsified because turn-based Fluid processing coalesced observer
notifications. The service-sensitive comparison remained partly inconclusive:
means spanned 4.9%, but distributions overlapped and the serial controlled-local
design does not support a statistical ranking. See the [retained comparison](../../benchmarks/shared-tree/26186ca7975/README.md).

## Implementation Defects

- Delegated benchmark summaries claimed that zero-byte Rust artifacts were valid.
	Direct file-size and JSON checks caught the defect before integration. This was
	a validation/tooling defect, not a product defect.
- The benchmark initially retained a mutable diagnostic tuple by reference,
	producing zero deltas; copying the baseline fixed the local harness defect.
- No Rust service, storage, or Fluid adapter implementation defect was identified.

## Shared Abstraction Findings

- Supported: repeated scalar assignment provides a real fixed-size SharedTree
	workload across all six full-driver arms.
- Falsified: observer `nodeChanged` count is not a logical edit count under
	turn-based batching.
- Supported with limitation: final scalar convergence is a valid final-state
	invariant, but it cannot establish preservation of intermediate values.
- Supported: one native service continues to compose with local memory and
	WebTransport memory, buffered-file, and durable-file storage modes without
	changing the tested workload.
- Inconclusive: the 0.8% spread among Rust WebTransport storage means is too small
	for a storage ranking from eight serial samples.

## Decisions

No decision record was created. Product batching, protocol limits, connection
limits, storage defaults, and durability semantics remain unchanged. The
benchmark claim was narrowed in its reports rather than changing shared APIs.

## Comparative Results

All arms used identical requested edits, warmup, client topology, runtime
batching, and final-state convergence. Mean throughput was Tinylicious 3,959.2;
Rust local memory 3,873.0; TypeScript local service 3,807.8; Rust WebTransport
memory 3,797.1; buffered file 3,796.9; and durable file 3,767.2 requested edits/s.
The comparison preserves guarantee labels: memory is volatile, buffered append
does not durable-sync acknowledgement, durable file remains the product default,
and Tinylicious is a development service. Runtime dependencies and implementation
size were unchanged. External service CPU/RSS remained diagnostic rather than a
whole-system comparison.

## Learning and Process Findings

The [retrospective](retrospective.md) records the user's workload correction,
observer coalescing, copied-worktree generated-output friction, FSP4 burst
calibration, native connection lifecycle ceiling, and invalid delegated artifact
summaries. `LEARNINGS.md` now distinguishes fixed-size requested-edit throughput
from independently verified logical-operation capacity and requires direct
validation of retained evidence bytes and contents.

## Skill Changes

The [skill review](skill-review.md) defers coordination-skill changes pending
evidence from another retained benchmark. No skill or template was changed in
this iteration.

## Next Iteration Scope

Keep the six full-driver arms, one-writer/one-observer topology, fixed-size scalar
workload, standard batching, final-state convergence, and visible guarantee
labels for this comparison. Replace iteration `0009` only for service-overhead
interpretation; preserve it as growing-sequence evidence. No iteration `0011`
workstream is opened. Production membership, multi-writer, multi-document,
multi-node, power-loss, randomized independent-process statistics, and
Routerlicious/ODSP capacity remain deferred.

## Convergence Assessment

- **Semantic convergence:** final state passed on writer and observer in all 48
	retained samples; intermediate-value preservation remains unproven.
- **Implementation convergence:** one shared harness and workload serves all six
	arms; no product implementation fork was introduced.
- **Performance convergence:** the means remain within 4.9%, but overlapping
	distributions and serial order prevent a backend ranking.
- **Operational convergence:** storage guarantees remain intentionally unequal;
	production deployment, restart, and power-loss evidence is missing.
- **Process convergence:** workstream and integration records are complete; direct
	artifact validation is required because delegated summaries were unreliable.
