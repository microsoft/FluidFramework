# Iteration 0004: stateful-compression Instructions

Derived from iteration: 0003
Status: planned
Owner: GitHub Copilot stateful-compression coding agent

## Approved Scope

Prototype bounded stateful or block compression and compare it with the existing independent zlib frame wrapper. Preserve append receipts, record boundaries, arbitrary finite reads, snapshots, and corruption classification. The user approved this investigation in the [iteration 0003 Phase 3 report](../phase-3-report.md#next-iteration-scope). Broad optimization and changing the kernel to fit a codec are excluded.

## Prior Evidence

The current [compression wrapper](../../../crates/wrappers/compression/src/lib.rs) independently compresses every record, which gives random access but cannot exploit cross-record redundancy. Kernel reads may begin after any opaque position, and retention/snapshot lineage means decoder state cannot be assumed. This workstream must establish whether restartable bounded state can satisfy those laws.

## Hypothesis and Discriminating Check

Hypothesis: bounded restart blocks or snapshot-bound dictionaries can improve repeated multi-record compression while preserving arbitrary `read(after)` through explicit restart metadata or bounded reconstruction. The cheapest disproof is shared conformance plus reads from every position before/after snapshot and restart; unbounded replay from retained beginning or inability to decode after retention falsifies the transparent-wrapper design.

## Ownership and Dependencies

- Wave 1, independent of service assembly and encryption.
- Writable: a new crate under `rust-service/crates/wrappers/stateful-compression/` or a self-contained sibling module approved by the coordinator, plus the eventual iteration `0004` report.
- The existing compression wrapper is a read-only baseline. Use a maintained codec/library; do not implement a compression algorithm.
- Core, conformance, storage, and transport APIs are read-only. Do not add delayed acknowledgements, combine logical appends, or weaken arbitrary-position reads.
- Do not commit the shared lockfile or root member list; report dependency and registration changes for integration.

## Deliverables and Validation

- Test shared conformance, every-position resume, snapshot before/at/after block boundaries, reopen, truncation/corruption, empty/large records, bounded decoder memory, and composition as compression inside encryption.
- Compare persisted bytes, CPU time, and required restart reads against per-record zlib on identical seeded repeated and incompressible workloads; state guarantee differences.
- Run focused tests, strict Clippy, rustfmt, and deterministic comparison traces with an isolated target directory.
- Report block/dictionary format, restart policy, bounds, results, failed designs, dependencies, and commits.
- Stop with a minimized counterexample if useful state requires unbounded replay, retention-unsafe context, altered positions, delayed receipts, or cross-record trust-context leakage.
