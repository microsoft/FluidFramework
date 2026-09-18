# Decision Records

This directory contains append-only architectural and process decision records for the Rust service research project.

Use four-digit, globally increasing identifiers and a short slug:

```text
0001-position-serialization.md
0002-append-durability.md
```

Copy the decision template from `.github/skills/rust-service-coordination/assets/decision-record.template.md`. A record begins as `proposed` and becomes `accepted`, `rejected`, or `superseded`. Do not rewrite accepted history to reflect a later conclusion; add a new record and link both records through their `Supersedes` and `Superseded by` fields.

Create a decision record when a choice changes shared semantics, public APIs, crate boundaries, iteration scope, conformance expectations, or the coordination workflow. Local implementation choices can remain in the applicable workstream report.

Current coordination decision:

- [0010: Proportional Iteration Workflow](0010-proportional-iteration-workflow.md)
