# Iteration 0015 Skill Review

## Evidence Reviewed

Reviewed the five [workstream reports](phase-2/), the
[integration report](phase-2/integration.md), 48-row
[quality inventory](quality-inventory.md), [Phase 3 contract review](phase-3-report.md#contract-and-test-quality),
and [retrospective](retrospective.md). Reusable surfaces were compared with the
Phase 2 integration commit `76a8526a42abd645e2d6d3fc2d32bbfb53ffc6ad`.

The prior exact-owning-decision refinement, execution-isolation recommendation,
inventory validator, and six deferred product triggers were reconsidered. The
two report-template cleanup commits, iteration `0014` `6722ea20760` and iteration
`0015` `c88a010dea5`, supplied repeated evidence for record validation.

## Candidate Skills or Changes

- **Precise contract traceability:** when accepting relied-upon behavior, quote
	or link the owning contract text instead of inferring a promise from code or
	tests. This separates implemented behavior from supported behavior.
- **Owner-local diagnostic evidence:** assess independently whether a regression
	failure identifies the responsible implementation locally. Shared conformance
	still proves a law, but it does not replace a practical focused test merely
	because the implementation invokes the suite.
- **Duplicate-report prevention:** reject a validated Markdown record unless it
	contains exactly one top-level heading. This catches a completed report with a
	second template appended while remaining independent of report names.
- **Execution isolation:** retain absolute checkout, branch, HEAD, selected-test,
	and exit-status evidence. The repeated interruptions justify continued use but
	do not identify a further reusable text change.
- **Shared semantic decision record:** reconsidered for all six deferrals. Their
	prerequisites remain absent, so no semantic choice is supported.

## Decisions

- **Accepted:** precise contract traceability and owner-local diagnosis belong in
	the quality skill, workstream report template, integration report template,
	Phase 3 template, next workstream instruction, and the existing durable lesson.
- **Accepted:** duplicate top-level-heading rejection belongs in the coordination
	record validator because the same append defect occurred in two consecutive
	iterations.
- **Accepted with no additional edit:** execution provenance remains covered by
	the coordination skill and workstream practice.
- **Rejected for this iteration:** a new skill; the quality and coordination
	skills already own the reusable procedures.
- **Deferred:** a shared semantic decision record and work on the six product
	findings until their recorded triggers occur.

## Applied Changes

- The quality skill now requires precise contract text and separately evaluates
	owner-local diagnosis for adequate dispositions and integration review.
- Workstream, integration, and Phase 3 templates prompt the same independent
	checks.
- The coordination record validator rejects records with zero or multiple
	top-level headings. `node --check` passed, and a disposable copied iteration
	with a second heading failed specifically with the new diagnostic.
- The existing correctness lesson in `LEARNINGS.md` includes contract text and
	local diagnosis.
- The iteration `0016` `contract-locality` instruction challenges all inherited
	adequate rows neutrally, allows at most two clusters, and forbids shared
	semantic, API, format, dependency, manifest, and lockfile changes.
- Record, inventory, documentation, Biome, and diff validation passed after the
	Phase 3 edits.

## Next Review Triggers

- Iteration `0016` still accepts an adequate row without precise contract text or
	practical owner-local diagnosis.
- A completed record passes validation with duplicated generated structure or a
	repeated template append recurs.
- Isolated command evidence continues to bind to sibling worktrees, terminate
	cold builds, or obscure selected-test counts.
- A deferred product boundary gains its required fault seam, consumer contract,
	architecture authority, or platform fixture.
- The next neutral repeat finds material new evidence gaps or instead supplies
	the first no-material-deficiency convergence result.
