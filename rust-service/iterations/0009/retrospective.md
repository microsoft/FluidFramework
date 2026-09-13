# Iteration 0009 Retrospective

## What We Expected

We expected one workstream to create a fair single-writer capacity comparison across six complete Fluid driver surfaces. The workload would issue a large identical burst of real SharedTree edits from one container, wait once for a second container to converge, prove the exact logical edit count, and isolate Rust transport/storage choices without weakening durable defaults or semantic contracts.

## What We Observed

All six arms passed correctness smoke and ten retained 10,000-edit repetitions. Mean throughput clustered between 3,210.9 and 3,327.6 logical edits/s. The narrow 3.6% total spread and overlapping distributions indicate that this localhost workload did not expose a large backend throughput difference. That is a useful negative result, not proof of equal production capacity. Storage substitution and browser-local reuse of the native service worked; production membership, multi-node behavior, power loss, and saturation remain unresolved.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Dependency installation initially appeared successful but did not link the requested root importer; direct TypeScript resolution exposed missing local-driver and local-server packages. The [workstream report](phase-2/full-driver-single-writer-capacity.md#notable-events) records the correction and published server dependency.
- Copied incremental build state referred to ignored Fluid declarations that were absent in the new worktree. Rebuilding the exact dependency closure recovered the environment; future work should test the downstream declaration rather than trust cache speed.
- Native service WASM compiled before failing at runtime on `SystemTime::now()`. A browser smoke of the first stateful operation exposed the gap and led to target-local atomic scope generation.
- Scalar replacement and per-edit waits could not answer the requested capacity question. Append-only edits, burst submission, and exact final count/value validation corrected the design before retained measurement.
- The first redirected result labeled itself dirty because its output appeared in repository status. A narrow benchmark-output exclusion corrected provenance without hiding source or lockfile changes.
- Final dependency-inclusive Clippy under Rust 1.98.1 found three `drop_non_drop` warnings in unchanged crates. Strict `--no-deps` lint proved the touched packages while the broader limitation remained recorded rather than expanding scope.

## Agentic Development Findings

One workstream was the right decomposition because storage selection, browser WASM, full Fluid drivers, workload semantics, and evidence provenance had to remain aligned. The charter supplied a cheap 100-edit disproof and strong stopping conditions. The user intervention that rejected earlier offered-load/latency evidence materially improved the question and forced full-driver, real-SharedTree, single-writer equivalence.

Implementation and integration handoff remained conflict-free. Most friction came from environment reconstruction: the root workspace excludes server packages, copied incremental state outlived ignored generated declarations, WASM compilation did not predict `SystemTime` runtime support, and one published server package required a browser shim. Direct package-resolution checks and early smoke runs were more informative than successful broad setup commands. Validation correctly retained a new Rust 1.98.1 dependency-inclusive Clippy failure while proving touched packages with `--no-deps`.

## Practices to Keep, Change, or Stop

- Keep: use append-only or independently counted application state for capacity workloads where protocol batching may differ from logical edits. Owner: benchmark author.
- Keep: run a cheap correctness smoke for every backend before expensive retained repetitions. Owner: implementation agent.
- Keep: record guarantee labels next to every throughput figure and keep weaker storage modes opt-in. Owner: report author.
- Change: after copying a worktree, verify generated declarations and dependency links directly before trusting incremental build success. Owner: coordinator.
- Change: define benchmark output exclusions before the first retained run and keep the exclusion narrower than source/lockfiles. Owner: benchmark author.
- Stop: presenting alternating-writer, per-edit convergence latency or final scalar replacement as sustained logical-operation capacity. Owner: coordinator.

## Durable Lessons

Promoted: logical-operation capacity must use an independently countable state invariant and include final observer convergence. This generalizes wherever application operations can be batched, coalesced, or represented by a different number of protocol messages.

Not separately promoted: copied-worktree generated-output checks are already covered by the existing lesson that cached metadata is not readiness evidence; browser runtime smoke and narrow output-provenance exclusions remain practical instruction guidance.

## Open Questions

- Would randomized run order and more repetitions distinguish the small observed backend differences from host/browser noise?
- At what offered load does one writer saturate the browser, transport, sequencer, or storage path, and how should backpressure be measured?
- How do multi-writer and multi-document workloads change batching, fairness, memory growth, and convergence?
- What production membership and replicated notification design preserves the current cursor, ambiguity, and shutdown semantics?
- How should restart and power-loss qualification compare buffered and durable acknowledgements?
