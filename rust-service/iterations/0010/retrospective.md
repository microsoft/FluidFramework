# Iteration 0010 Retrospective

## What We Expected

We expected a one-field SharedTree overwrite to remove iteration `0009`'s
sequence-growth cost while preserving exact writer and observer event accounting.
We planned six 100-edit smokes followed by ten identical large repetitions on the
same full-driver arms.

## What We Observed

The fixed-size workload worked and increased mean throughput relative to the
append workload. Exact observer accounting did not: turn-based batching produced
two observer notifications regardless of thousands of assignments. Final state
converged in every retained sample, but intermediate values are not independently
proved. FSP4 limited a synchronous burst to fewer than 10,000 edits, and native
connection lifecycle limited one process to eight fast two-container samples.
The final matrix therefore uses eight repetitions of 5,000 measured edits after
500 warmups for every arm.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Observer-count waits failed for two and ten edits before the harness adopted
	final-value convergence. [Workstream event](phase-2/fixed-size-single-writer-capacity.md#notable-events)
- Broad copied-worktree dependency builds consumed substantial effort because
	ignored generated declarations and stale build metadata disagreed. Existing
	same-source outputs and focused package checks completed validation.
- A 10,000-edit Rust-local probe hit FSP4's 512 KiB field limit; 4,000 and 5,000
	probes passed. [Calibration](../../benchmarks/shared-tree/26186ca7975/README.md#calibration)
- Two WebTransport memory runs failed at repetition nine after eight successful
	samples, matching two connections per sample and the native default of 16.
- Four delegated Rust outputs were zero bytes despite success summaries. Direct
	reruns with `test -s` and JSON assertions produced the retained evidence.
	[Validation record](phase-2/fixed-size-single-writer-capacity.md#validation-evidence)

## Agentic Development Findings

The single-workstream decomposition was appropriate, and isolated worktree
integration was conflict-free. The initial instructions overconstrained exact
observer event counts without accounting for runtime batching; the falsification
was useful, but the stopping language required an explicit narrower benchmark
claim. The user's correction directly improved workload validity. Delegated
execution summaries were not trustworthy for retained artifacts, so direct
commands and independent parsing became authoritative. Frequent focused probes
prevented the 10,000-edit and ten-repetition assumptions from reaching the final
matrix.

## Practices to Keep, Change, or Stop

- **Keep, benchmark owner:** smoke every backend before retained runs and preserve
	clean-source provenance.
- **Keep, benchmark owner:** use one identical workload and visible guarantee
	labels across all arms.
- **Change, benchmark owner:** calibrate encoded burst size and connection
	lifecycle before choosing operation and repetition counts.
- **Change, coordinator:** require nonempty-file and independent JSON assertions
	after delegated evidence generation.
- **Stop, benchmark owner:** treating observer notification counts as logical edit
	counts under a batched runtime.

## Durable Lessons

Two findings were promoted. Fixed-size scalar benchmarks need explicit
requested-edit wording because final state and coalesced notifications cannot
prove intermediate logical operations. Retained machine-readable evidence must
be checked for nonzero bytes and parsed independently of the producing command's
summary. Both apply beyond this service and benchmark.

## Open Questions

- Can Fluid telemetry or service acknowledgements count independently sequenced
	intermediate scalar edits without changing batching cost?
- Would randomized fresh-process repetitions preserve the observed 4.9% span?
- How much of the remaining elapsed time is SharedTree/browser work versus
	transport and service processing?
- Should a future benchmark reuse one browser or explicitly close transport
	sessions to permit more than eight native repetitions per process?
