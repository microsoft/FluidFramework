# Iteration 0010: fixed-size-single-writer-capacity Instructions

Status: active
Branch: `rust-service-iteration-0010-fixed-size-single-writer-capacity`
Iteration source commit: `d5238a5a93098f8fe8cd14f7828e311450aa4aa2`
Owner: GitHub Copilot
Report: `rust-service/iterations/0010/phase-2/fixed-size-single-writer-capacity.md`

## Assignment

Replace iteration `0009`'s append-only numeric array workload with repeated overwrites of one numeric field in a fixed-size SharedTree object, then rerun the same six full-driver single-writer arms. Hypothesis: removing sequence-growth work produces a fairer service-overhead comparison. Preserve independent correctness by counting `nodeChanged` applications on both writer and observer and requiring exact counts plus final-value convergence. Disprove first with a 100-edit smoke on every backend.

## Ownership

Writable: `rust-service/tests/minimal-fluid-driver/`, a new directory under `rust-service/benchmarks/shared-tree/`, and this workstream report. Read-only: Rust service/storage implementation, accepted decisions, iteration `0009` records/evidence, unrelated Fluid packages, generated API reports, and lockfiles. Do not alter storage guarantees, transport behavior, membership, durable defaults, or the workload per backend.

## Expected Evidence

- Shared schema is a fixed-size object with one numeric field initialized once.
- Every measured edit is one direct overwrite of that field by writer index `0`; observer index remains `1`.
- Writer and observer count separately applied `nodeChanged` events, with baseline-aware exact warmup and measured assertions and final-value convergence.
- All six 100-edit smokes pass before large runs.
- All six arms use the same large operation/warmup/repetition settings and retain clean-source JSON with startup, submission, convergence, throughput, event counts, environment, external server CPU/RSS, and available Rust wire/queue metrics.
- A retained comparison explicitly supersedes iteration `0009` for service-overhead interpretation without deleting its historical evidence.

## Validation

Print absolute checkout, branch, commit, and final exit status with delegated commands. Run minimal-driver format, lint, both typechecks, unit tests, and benchmark bundle builds under Node `22.23.2`. Run all six 100-edit smokes, validate exact event counts/final values, then run repeated clean-source measurements. Verify root and Rust lockfiles are unchanged. Run `git diff --check` and the iteration Phase 2 artifact validator after integration.

## Escalation and Stopping Conditions

Stop and retain evidence if `nodeChanged` counts are coalesced or differ across full-driver arms, if fixed-size state still grows, if an arm cannot use the identical overwrite, or if correctness requires a service/storage change. Do not fall back to final-value-only validation or silently vary operation counts. Treat overlapping throughput distributions as an inconclusive ranking, not a failed experiment.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
