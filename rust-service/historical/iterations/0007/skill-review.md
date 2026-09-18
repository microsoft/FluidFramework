# Iteration 0007 Skill Review

## Evidence Reviewed

Reviewed the [Fluid lifecycle events](phase-2/fluid-read-reconnect-lifecycle.md#notable-events), [shutdown events](phase-2/native-graceful-shutdown.md#notable-events), [integration findings](phase-2/integration.md#cross-workstream-findings), and [retrospective](retrospective.md#agentic-development-findings) against the coordination skill at iteration source `9c65ff3e7b6`.

## Candidate Skills or Changes

- Browser lifecycle diagnosis: when a projected operation is sequenced but Fluid closes or fails to converge, capture stage, connection mode/identity, server and client sequence fields, projected envelope identity, disposal state, and error telemetry before inspecting opaque payloads. This isolated four adapter defects without DDS decoding.
- Interrupted workstream recovery: when an agent stops without a final report, capture exact worktree/branch/HEAD, running processes, retained logs, dirty paths, and unresolved report fields before rerunning or editing. This preserved the lifecycle agent's successful dependency build and initial discriminating trace.
- Runtime-engine declaration: when validation crosses nested pnpm workspaces, state the required Node major in instructions and activate it before installation. Node 22 avoided Routerlicious engine rejection.

## Decisions

- Browser lifecycle diagnosis: accepted as a durable learning, not a standalone skill. Iterations `0006` and `0007` provide repeated evidence, but the procedure remains compact enough for workstream instructions.
- Interrupted workstream recovery: accepted as practice, no skill edit. The current Recovery section already preserves dirty worktrees and unsupported metadata; execution discipline was the gap.
- Runtime-engine declaration: accepted for the next instruction, no global skill edit because the requirement is repository/workspace-specific.

## Applied Changes

No skill, template, or script changed. The iteration `0008` instruction explicitly records Node 22 for engine-constrained dependency setup and the accepted diagnostic evidence.

## Next Review Triggers

- Another workstream stops after modifying files without completing its report.
- Browser lifecycle diagnosis requires the same telemetry sequence in a third iteration.
- Delegated validation again omits checkout identity or claims commands ran when they did not.
- Node runtime mismatch recurs despite an explicit instruction.
- A future streaming workstream cannot stay within one ownership boundary and needs sequential protocol/native/consumer waves.
