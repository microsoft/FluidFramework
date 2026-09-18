# Iteration 0010 Skill Review

## Evidence Reviewed

Reviewed the workstream [notable events](phase-2/fixed-size-single-writer-capacity.md#notable-events),
the Phase 2 [cross-workstream findings](phase-2/integration.md#cross-workstream-findings),
and the [retrospective](retrospective.md). The active coordination skill was read
from `.github/skills/rust-service-coordination/SKILL.md` at the iteration base.

## Candidate Skills or Changes

- **Retained artifact gate:** after any delegated generation of machine-readable
	evidence, require expected-file count, nonzero byte size, parse success, and
	domain invariants before accepting the summary. This would have caught four
	empty files immediately.
- **Benchmark calibration gate:** before a repeated matrix, probe encoded payload
	limits and repeated connection lifecycle in addition to one workload smoke.
	This would have exposed both the FSP4 and repetition-nine ceilings earlier.
- **Batched-event wording:** instructions using event counts must first establish
	whether notifications correspond one-to-one with logical operations; otherwise
	prescribe diagnostic wording and an independent state invariant.

## Decisions

All three candidates are deferred for a coordination-skill change until another
benchmark confirms the triggers. Their substantive lessons are accepted in
`LEARNINGS.md`; changing the general iteration workflow from one benchmark would
be premature.

## Applied Changes

None. No skill, template, or validator script changed.

## Next Review Triggers

- Another delegated task reports retained evidence without byte and parse checks.
- Another benchmark reaches a protocol or connection ceiling only during the
	expensive matrix rather than calibration.
- Another instruction equates runtime notification count with logical operation
	count without a one-to-one contract.
