# Iteration 0010 Phase 2 Integration

Status: complete
Integration branch: `rust-service-iteration-0010`
Iteration base commit: `1e9fd4532e7`
Integration commit: `7dfcdf9ec3c56b35fbf5b5801c2764a859c8a997`

## Accepted Work

- `fixed-size-single-writer-capacity`: accepted workstream commits
	`26186ca79751d4db3261e24d549b5b9b1e2db2c0` through `d33f312071e`, integrated
	as `264d3eca639` through `9e8e9de063e`.
- Deliverables include the fixed-size scalar-overwrite harness, six retained raw
	JSON artifacts, comparison report, and completed workstream report.

## Rejected or Deferred Work

No workstream commits were rejected. Production membership, multi-writer,
multi-document, multi-node, power-loss, retention, randomized independent-host
measurement, and Routerlicious/ODSP capacity remain deferred by the charter.

## Conflict Resolution and Adaptation

The three workstream commits cherry-picked without conflict. Integration accepts
the measurement as requested application-edit throughput with final-state
convergence, not as proof that every intermediate scalar assignment was
independently sequenced. This explicitly narrows the claim after the charter's
exact observer-event hypothesis was falsified by turn-based notification
coalescing.

## Validation Evidence

- Workstream checkout at harness commit `26186ca7975`: minimal-driver format,
	lint, both TypeScript typechecks, three Node tests, all benchmark bundles, and
	`git diff --check` passed under Node `22.23.2`.
- Six 100-edit/10-warmup full-driver smokes passed before retained measurement.
- Six retained files and 48 samples passed independent source, configuration,
	final-value, writer-diagnostic, observer-diagnostic, timing, and external
	process-metadata validation.
- Integration checkout `pnpm run check:format`: unavailable because copied
	worktree lacks ignored `node_modules`; direct output was `biome: not found`.
	No dependency install or lockfile mutation was performed because the
	conflict-free integrated source is identical to the validated workstream.
- Phase 2 iteration-record validation and final diff/lockfile checks are recorded
	in the integration-boundary commit that follows this report.

## Cross-Workstream Findings

- Observer `nodeChanged` counts are coalesced under default turn-based batching
	and cannot serve as logical operation counts.
- Final scalar convergence proves final state but not preservation of every
	intermediate assignment.
- FSP4's 512 KiB payload field limit rejected a 10,000-edit synchronous burst;
	5,000 is the largest tested round common count.
- The default native 16-connection limit supports eight two-container samples
	before fast browser lifecycles reach the ceiling; all arms therefore retain
	eight repetitions.
- Delegated command summaries incorrectly described zero-byte artifacts as
	valid; direct nonempty-file and JSON validation was required.

## Artifact Check

The sole active workstream report is complete, its accepted commit range is
listed above, and its worktree is clean. All six intentional benchmark artifacts
and their methodology report are tracked under
`rust-service/benchmarks/shared-tree/26186ca7975/`. No uncommitted implementation
artifact is intentional.
