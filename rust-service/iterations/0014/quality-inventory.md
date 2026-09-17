# Iteration 0014 Rust Quality Inventory

Status: in progress
Source commit: `e06794556ebb92d2d33b83577f903e201fd78b2a`
Configured scope: All 14 Rust workspace packages, partitioned by crate in [the charter](charter.md).
Inherited inventory: Iteration `0013` workstream reports and Phase 3 synthesis; no prior quality-inventory file exists.
Budget and stopping conditions: At most two unrelated repair clusters per crate, with risk reranking and the materiality, ownership, and proportionality stops in [the charter](charter.md).

## Selection Rationale

Every Rust package receives one independent workstream because the run is
testing whether the reusable risk method can improve on a prior workspace-wide
audit without seeded findings. Within each crate, agents prioritize actual
consumer reliance, lifecycle and failure semantics, persistence or protocol
boundaries, state transitions, shared implementations, complexity, recent
change evidence, and weakness of existing focused tests. They compare selected
boundaries with iteration `0013` evidence before changing code. Non-Rust work,
format redesign, broad API changes, and volume-based documentation or testing
rank below these behavioral boundaries and are deferred by the charter.

## Reviewed Boundaries

Use stable identifiers where practical. Test layers are `focused`,
`conformance`, `integration`, `generated`, and `platform`.

| Boundary | Owner and consumers | Risk evidence | Relied-upon contract | Existing test layers | Finding and discriminating check | Disposition | Changed contract/tests | Validation | Revisit trigger |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <!-- TODO(required): replace with reviewed boundaries; do not use a placeholder or declaration-per-row inventory --> | | | | | | | | | |

## Deferred Candidates

<!-- TODO(required): list material candidates excluded by scope or budget, why they were not selected, remaining risk, and a concrete revisit trigger; write none after review when applicable -->

## Coverage Layer Review

<!-- TODO(required): summarize whether focused, conformance, integration, generated-binding, and platform tests prove distinct responsibilities; identify accepted overlap, consolidation, or remaining broad-only evidence -->

## Convergence Assessment

<!-- TODO(required): compare inherited findings, changed boundaries, new material findings, repaired risk, redundant churn, and the configured stopping conditions. State whether another run is justified and the hypothesis it would test. -->
