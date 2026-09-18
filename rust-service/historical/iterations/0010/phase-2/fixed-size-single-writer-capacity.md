# Iteration 0010: fixed-size-single-writer-capacity Report

Status: complete
Branch: `rust-service-iteration-0010-fixed-size-single-writer-capacity`
Worktree: `/workspaces/FluidFramework-rust-service-iteration-0010-fixed-size-single-writer-capacity`
Base commit: `1e9fd4532e7`
Final commit: `2887ed16b99ab07e373e2966b26704221197573e` (retained evidence; this
completed report follows as a documentation-only commit)
Agent or owner: GitHub Copilot
Model and tool version: GitHub Copilot; model version unknown
Instruction source: [`instructions/fixed-size-single-writer-capacity.md`](instructions/fixed-size-single-writer-capacity.md) at `1e9fd4532e7`
Session or transcript reference: none
Started and finished: 2026-09-13

## Outcome

Implemented and measured a six-arm, full-Fluid-driver SharedTree capacity matrix
using repeated overwrites of one numeric field. All 48 retained samples passed
final writer/observer convergence. Mean end-to-end throughput ranged from
3,767.2 to 3,959.2 requested edits/s, a 4.9% span. Confidence is high in workload
equivalence and final-state convergence, moderate in the controlled-host
distributions, and low for production extrapolation or preservation of every
intermediate scalar value.

## Hypothesis Results

- **Fixed-size workload: supported.** All arms overwrite one numeric field in a
	fixed-size object. No measured edit grows a SharedTree sequence. See
	[`../../../benchmarks/shared-tree/26186ca7975/README.md`](../../../benchmarks/shared-tree/26186ca7975/README.md).
- **Exact observer event count: falsified.** Default turn-based processing
	coalesces the remote warmup and measured bursts into two observer
	`nodeChanged` notifications. Final scalar convergence is authoritative and
	event counts remain diagnostics.
- **Fair full-driver comparison: supported with a limitation.** All six arms use
	two full Fluid containers, writer `0`, observer `1`, identical 500-edit warmup,
	5,000-edit measured burst, and eight repetitions. Final state cannot prove that
	every intermediate overwrite was independently sequenced.
- **Reduced sequence-growth interference: supported.** Mean throughput increased
	relative to iteration `0009`, and the operation mutates fixed-size state. The
	retained results supersede iteration `0009` only for service-overhead
	interpretation.

## Deliverables and Commits

1. `26186ca79751d4db3261e24d549b5b9b1e2db2c0` - fixed-size schema,
   overwrite workload, final-value convergence, batching diagnostics, and
   initial workstream record.
2. `2887ed16b99ab07e373e2966b26704221197573e` - six retained JSON
	artifacts, comparison, and completed workstream report.

## Validation Evidence

- `pnpm run check:format && pnpm run lint && pnpm run typecheck && pnpm run typecheck:shared-tree && pnpm test && pnpm run build:benchmarks`: passed under Node `22.23.2`; three Node tests passed and all benchmark bundles built.
- `git diff --check`: passed before measurement.
- Six clean-source 100-edit/10-warmup smokes: passed. Every writer reported 110 changes, every observer reported two batched changes, and final value equaled initial value plus 110.
- One Rust-local 10,000-edit probe: correctly rejected by the 512 KiB FSP4 payload field limit.
- One Rust-local 4,000-edit and one 5,000-edit calibration probe: passed; 5,000 was selected.
- Two ten-repetition Rust WebTransport memory attempts: each passed eight samples and failed opening repetition nine at the native 16-connection ceiling.
- Eight repetitions of 5,000 measured edits and 500 warmups for all six arms: passed. The authoritative outputs are retained under [`../../../benchmarks/shared-tree/26186ca7975/`](../../../benchmarks/shared-tree/26186ca7975/README.md).
- An independent validator checked six nonempty files, common clean source commit/configuration, 48 samples, exact final values and writer diagnostics, positive finite timings, observer diagnostics, and expected service-process metadata.

## Notable Events

Record an event when a hypothesis is falsified, three similar attempts fail, substantial effort is lost, human intervention is needed, a workaround appears, or a reusable technique is discovered.

| Type | Attempt or event | Evidence | Impact | Resolution or state | Reusable lesson |
| --- | --- | --- | --- | --- | --- |
| Human correction | Iteration `0009` used append-only array growth to prove every logical edit survived. | The user identified that SharedTree append cost scales with sequence size and can dominate the service overhead under study. | The retained `0009` results remain valid for growing-sequence application throughput but not as the desired service-overhead isolation. | Iteration `0010` replaces the array with one numeric field, validates final-value convergence, and retains writer/observer `nodeChanged` counts as batching diagnostics. | Correctness instrumentation must not change the asymptotic application workload being measured. |
| Falsified correctness check | Writer and observer `nodeChanged` events were expected to count every synchronous field overwrite. | A one-edit local-service smoke reported `[1, 1]`, while two or more edits timed out waiting for the observer count; default turn-based Fluid processing coalesces remote change notification. | Event count cannot prove every logical assignment on the observer without changing flush behavior. | Final scalar convergence is authoritative; writer/observer change-event counts remain diagnostics. All arms retain standard runtime batching because `TinyliciousClient` does not expose runtime options. | Do not infer logical operation count from observer change events when runtime batching can squash notification delivery. |
| Falsified calibration | Iteration `0009`'s 10,000-edit count was expected to remain usable for scalar overwrites. | Rust-local rejected the measured burst with `field exceeds its configured limit`; FSP4 permits a 512 KiB payload field. | A common 10,000-edit burst cannot traverse every tested driver without changing protocol or flush semantics. | Probed 4,000 and 5,000 edits; retained 5,000 as the largest tested round common count. | Recalibrate batch size when operation encoding changes, even if state size shrinks. |
| Harness ceiling | Ten fast WebTransport repetitions were expected to complete against one native process. | Two attempts passed eight repetitions, then repetition nine hit QUIC opening timeout; two container connections per sample fill the default 16-connection limit before prior browser sessions age out. | Ten repetitions would require changing server configuration or process lifecycle for only the networked arms. | Retained eight repetitions uniformly across all six arms and documented the resulting sample-size limitation. | Account for connection lifecycle, not just operation count, when a runner launches a fresh browser per sample. |
| Validation failure | Delegated commands reported successful retained Rust artifacts. | Independent `wc -c` and JSON parsing found four zero-byte Rust outputs; direct reruns exposed the payload and connection failures. | Invalid evidence could have been accepted despite reported checks. | Reran every Rust arm directly and required `test -s` plus immediate JSON validation after each command. | Verify retained artifact bytes and parse them independently; a summarized delegated success is not evidence. |

## Contract and Integration Friction

`TinyliciousClient` does not expose runtime options equivalent to the custom
loaders, so all arms retain default turn-based batching. The FSP4 512 KiB payload
limit bounds one synchronous scalar burst to fewer than 10,000 edits. The native
service default permits 16 concurrent connections; eight two-container samples
fit, while a ninth fast browser lifecycle does not. Fresh copied worktrees also
lacked ignored generated Fluid declarations, WASM bindings, certificates, and
Tinylicious output; declarations and bindings were regenerated or copied from
the same-source checkout, and services used generated artifacts outside tracked
paths.

## Human Interventions

The user identified that iteration `0009`'s append cost grows with sequence size
and requested repeated numeric-field overwrites instead. That correction changed
the benchmark from growing-sequence application throughput to a fixed-size state
workload intended to expose service overhead more directly.

## Measurements

The retained comparison is
[`../../../benchmarks/shared-tree/26186ca7975/README.md`](../../../benchmarks/shared-tree/26186ca7975/README.md).
Mean throughput was: Tinylicious 3,959.2; Rust local memory 3,873.0;
TypeScript local service 3,807.8; Rust WebTransport memory 3,797.1;
Rust WebTransport buffered file 3,796.9; and Rust WebTransport durable file
3,767.2 requested edits/s. The six means span 4.9%; no statistical ranking is
claimed.

Environment: Linux `6.8.0-1064-azure`, AMD EPYC 7763, 32 logical CPUs, Node
`22.23.2`, and headless Chrome 152. Across eight repetitions, Rust WebTransport
used 0.42-0.49 external CPU seconds and 14,980-15,272 KiB peak RSS; Tinylicious
used 2.74 CPU seconds and 166,728 KiB peak RSS. Browser and whole-system resource
use were not measured. Elapsed implementation effort is unknown.

## Proposed Decisions

No shared decision is proposed. This iteration changes benchmark methodology,
not product protocol, storage, batching, or durability semantics.

## Candidate Skills and Process Changes

- Add retained-evidence validation that requires every expected file to be
	nonempty, parses it independently, and checks source/configuration/sample
	invariants after the producing command exits.
- Calibrate both encoded burst size and browser/service connection lifecycle
	before committing to an expensive repeated matrix.
- Treat observer notifications as diagnostics under batched runtimes; choose an
	append-only invariant only when proving every logical operation is more
	important than fixed-size application cost.

## Remaining Work and Risks

Implementation and measurement are complete. Phase 2 must integrate the harness
and evidence commits, run the artifact validator and workspace checks, and record
the immutable integration commit. Final scalar convergence does not prove every
intermediate overwrite was independently sequenced, so these results should be
described as requested application-edit throughput. The artifacts remain
provisional controlled-local evidence; randomized order, more independent
server processes, and production services remain deferred.
