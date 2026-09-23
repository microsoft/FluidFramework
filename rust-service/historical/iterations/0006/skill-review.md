# Iteration 0006 Skill Review

## Evidence Reviewed

Reviewed both [native concurrency](phase-2/native-connection-concurrency.md#notable-events) and [direct SharedTree](phase-2/direct-shared-tree-integration.md#notable-events) events, [integration friction](phase-2/integration.md#conflict-resolution-and-adaptation), and the [retrospective](retrospective.md#agentic-development-findings) against the coordination skill inherited from iteration source `3a72dfe57b8`.

## Candidate Skills or Changes

- Browser Fluid adapter diagnosis: when projected messages arrive but a DDS does not converge, capture stage, mode/disposal/checkpoint state, envelope metadata, and error telemetry before payload inspection. This distinguished membership and sequence defects without violating the opaque payload boundary.
- Delegated evidence enforcement: when a summary omits checkout identity, counts, or artifact paths, reject it and rerun the narrow command directly. This would prevent accepting work performed in another worktree.
- Generated consumer readiness: when tests import ignored generated artifacts or workspace build outputs, verify files exist and regenerate/build them in the target checkout before executing the consumer.

## Decisions

- Browser Fluid adapter diagnosis: deferred as a standalone skill until reused in iteration `0007`; retained in reports and learnings now.
- Delegated evidence enforcement: accepted as practice, but no skill change. The current skill already states this requirement; execution discipline was the defect.
- Generated consumer readiness: accepted as an iteration instruction/checklist requirement, but no coordination-skill change. Existing generated-artifact language is sufficient.

## Applied Changes

None. No skill, template, or script change was justified.

## Next Review Triggers

- A second iteration reuses the browser lifecycle diagnostic procedure with similar savings.
- Delegated tools continue reporting an incorrect checkout after prompts require absolute path and branch.
- Generated-artifact omissions recur despite explicit next-workstream validation commands.
- Independent workstreams conflict on shared Fluid adapter or native shutdown ownership.
