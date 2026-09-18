# Iteration 0012 Skill Review

## Evidence Reviewed

Reviewed all six workstream notable-event tables, Phase 2 integration, the
[retrospective](retrospective.md), and the current coordination skill. Revisited
iteration 0011's requirements for write-capable implementation agents, direct
Git-object inspection, exact generated-consumer execution, explicit cleanup, and
environment restoration.

## Candidate Skills or Changes

- **Repository documentation checker:** missing grouping/package orientation
	motivated a dependency-free checker that discovers configured roots, requires
	READMEs, and resolves local links. It provides a cheap repeatable structural
	gate; see the examples/benchmarks report.
- **Language-aware declaration inventories:** public compiler diagnostics did not
	cover private Rust or the full TypeScript charter. Retain the inventory method
	as a durable lesson rather than adding an unmaintained global analyzer.
- **Environment-boundary clarification:** integration inherited
	`CARGO_TARGET_DIR` across gates. The current skill already requires restoring
	command-scoped environment, so no duplicate rule is needed.
- **Write-capable dispatch and generated-output checks:** both recurred, but the
	current skill already states the required procedures explicitly.

## Decisions

- **Accepted:** keep `scripts/check-documentation.mjs` as repository-local
	validation and document its intentional limits.
- **Accepted:** promote language-aware documentation inventories to
	`LEARNINGS.md`.
- **Accepted, no skill edit:** environment restoration, write-capable dispatch,
	exact generated consumers, and explicit cleanup are already enforced by the
	coordination skill.
- **Deferred:** mandatory workspace-wide private Rust and TypeScript JSDoc linting
	until evidence justifies a maintained analyzer and exclusion policy.
- **Deferred:** Markdown anchor/external-link validation until a concrete failure
	demonstrates value.

## Applied Changes

- Added and documented `rust-service/scripts/check-documentation.mjs`; integration
	passed with 6 roots, 12 READMEs, and 12 local links.
- Added one confirmed mixed-language documentation lesson to `LEARNINGS.md`.
- No skill or template file changed. Existing `Run a Workstream`, `Integrate Phase
	2`, and `Recovery` guidance already owns the repeated process lessons.

## Next Review Triggers

- A future iteration again dispatches a read-only agent for implementation despite
	explicit write-capable instructions.
- Generated-consumer validation fails because target/output provenance or
	command-scoped environment is ambiguous.
- Documentation inventories repeatedly require ad hoc analyzers with inconsistent
	counting rules.
- Broken anchors or external links escape the current structural checker.
