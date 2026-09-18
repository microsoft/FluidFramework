# Iteration 0004: stateful-compression Instructions

Status: planned
Branch: `rust-service-iteration-0004-stateful-compression`
Iteration source commit: `a577eda313ebe68f6e8ba3e33e99ea0822a50d9a`
Owner: GitHub Copilot stateful-compression coding agent
Report: `rust-service/iterations/0004/phase-2/stateful-compression.md`

## Assignment

Prototype bounded restart-block or dictionary compression and compare it with independent zlib frames while preserving append receipts, record boundaries, arbitrary finite reads, snapshots, and corruption classification. Hypothesis: explicit restart metadata or bounded reconstruction improves repeated multi-record compression without unavailable history. Disprove with every-position resume and snapshot/reopen traces requiring unbounded replay or retention-unsafe state. Kernel changes and broad optimization are excluded.

## Ownership

- Independent Wave 1 workstream.
- Writable: new `rust-service/crates/wrappers/stateful-compression/` and `rust-service/iterations/0004/phase-2/stateful-compression.md`.
- Existing compression is the read-only baseline; core, conformance, storage, transport, and encryption are read-only.
- Use a maintained codec/library. Do not delay acknowledgements, combine logical appends, alter positions, or weaken arbitrary-position reads.
- Do not commit root workspace membership or lockfile; use a disposable exact copy for registration/dependency validation.

## Expected Evidence

- Shared conformance; every-position resume; snapshots before/at/after restart boundaries; reopen, truncation/corruption, empty/large records, bounded memory, and compression-inside-encryption compatibility.
- Compare persisted bytes, CPU observations, and restart reads with per-record zlib on identical seeded repeated and incompressible workloads.
- Report format/restart policy, hard bounds, retention assumptions, failed designs, dependencies, and commits. A well-evidenced negative result is complete.

## Validation

Print checkout identity. In a disposable exact copy with temporary registration, run focused tests, every-position conformance, deterministic comparisons, strict Clippy, and rustfmt with an isolated target directory. Verify no assigned-worktree root manifest/lockfile diff and report exact codec versions/features.

## Escalation and Stopping Conditions

Stop with a minimized counterexample if useful state requires unbounded replay, unavailable retained history, altered positions, delayed receipts, unbounded decoder memory, or mixed secret/attacker-controlled adaptive context. Do not change shared semantics to rescue the design.

## Reporting Requirements

Use the generated workstream report. Record failed approaches, substantial effort sinks, human interventions, undocumented workarounds, cross-workstream dependencies, and candidate reusable skills while work occurs.
