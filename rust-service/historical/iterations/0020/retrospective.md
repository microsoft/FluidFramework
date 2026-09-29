# Iteration 0020 Retrospective

## What We Expected

The approved incremental audit covered all 15 members in four independent workstreams.
The initial 20-30-boundary estimate was an effort estimate, not a cutoff.
We expected most changes to concern contracts and focused evidence, with semantic choices escalated before integration.
Guarded process tasks were expected to support independent edit/test loops without relying on shared foreground terminal isolation.

## What We Observed

The workstream reports account for 98 boundaries; the coordinator added one current-architecture documentation boundary.
Most dispositions retained existing contracts and tests without changes.
Localized repairs strengthened assertions at controlling decisions rather than adding declaration or line-coverage targets.
One demonstrated client error-classification bug required a public representation choice; the user deferred the proposed API and repair.
No accepted production behavior or public API changed.
All four delegates invoked their assigned tasks, and the handoffs integrated without source conflicts.
Final native, package, integration and browser validation passed after two concrete environment problems were resolved.
The earlier native opening timeout remains unattributed; passing retries do not explain it.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

| Trigger and attempt | Evidence and impact | Resolution or faster diagnostic |
| --- | --- | --- |
| Fresh integration checkout lacked TypeScript dependencies | Initial policy command failed before validation; worktree-local frozen offline install succeeded | Restore the actual checkout's dependencies after a missing-dependency failure; do not use an outer `node_modules` link |
| Worker fixture environment was not explicit | Acceptance checks were rerun with command-local worktree-owned fixture storage | Include fixture paths in attributable execution setup |
| Long integration `TMPDIR` broke Chromium startup | First extended run reported `Socket path too long`; 18 integration cases and the browser lifecycle test failed before their scenarios | A unique short `/tmp/q20-*` root passed a focused browser probe, then the real matrix |
| Tinylicious belongs to a separate dependency workspace | Second extended run passed 29 integration cases but failed its Tinylicious prerequisite | Frozen offline install in `server/routerlicious`, a focused Tinylicious correctness case, then the full extended gate passed |
| Native durable opening timed out | [Transport report](phase-2/transport.md) retains the exact failing stage, duration and counters; no targeted fix was found | Keep the incident open and collect worker/stage timing on recurrence |
| Cleanup failure hid the initiating timeout | Deterministic red/green experiment supported a compound-error proposal, but the user deferred the public API change | Preserve the experiment separately; integrate only the revised patch and record [Decision 0030](../../decisions/0030-defer-compound-client-errors.md) |
| Agent peer relays targeted guessed identities or arrived after ownership was settled | Stale messages added coordination work without new evidence | Use known agent IDs, one authoritative handoff and completion notifications; stop unnecessary relays |
| Editor diagnostics did not return | One request timed out after 1800 seconds | Mark it inconclusive and rely on actual compilation/Clippy evidence; do not repeat it as a gate |
| Initial log reference had the wrong UUID segment | The original native-failure log contains `499b`, not `499a` | Verify the file directly before copying an evidence reference |
| Independent review separated byte shedding from byte admission | The former test could pass with the admission byte predicate removed | Added a monitor-isolated exact-threshold admission test; the targeted mutation fails and restored code passes |
| New fixture initially submitted too much at once | 8 MiB and 4 MiB payload attempts hit the separate sequencer pipeline limit before reaching pressure assertions | Read the 4 MiB pipeline charge boundary and accumulate smaller 3/3/2 MiB events instead; retain fixture failures separately from mutation evidence |
| Post-repair concurrent server validation reproduced native timeout | The exact test and full serialized server suite passed without a source repair | User accepted a validation exception and closeout with the issue explicitly open |
| Complete record validation scans every historical decision | Nine missing headings in unchanged Decisions 0028/0029 also fail validation of completed iteration 0019 | User approved a historical-formatting exception; no prior decision was rewritten and no complete-validator pass is claimed |

Commands, run IDs, failures and final passes are retained in the [integration report](phase-2/integration.md).
Total elapsed work, model identities and token costs are unknown; command durations above are observed, not throughput estimates.

## Agentic Development Findings

Non-overlapping crate ownership allowed parallel audits and conflict-free integration.
The coordinator inspected actual frozen patches and command logs rather than accepting handoff prose alone.
Fresh review uses a fixed kickoff comparison and accessible baseline source, including the full dirty documentation snapshot.
The benchmark test seam and scripted factory peer are examples of isolating an actual owning decision without expanding public abstractions.
The explicit user decision prevented a locally plausible bug fix from silently changing public Rust enums.
The scope estimate understated the number of boundaries, but no time or row cutoff was imposed.
Autonomous delegate task invocation was observed; independent cancellation safety and coordination throughput improvement were not established.

## Practices to Keep, Change, or Stop

- Keep exact contract/decision/test links and full member accounting, including no-change results.
- Keep source and accepted-patch identities distinct when the user defers an experimental repair.
- Keep command-scoped environment settings, but use a sufficiently short owned temporary root for Chromium socket paths.
- Stop guessed peer routing and repeated acknowledgments after a frozen handoff.
- Run a focused prerequisite probe after correcting an environment failure before repeating a broad gate.
- The coordinator owns final report reconciliation, retained evidence and non-forced worktree cleanup.

## Durable Lessons

The short-path Chromium observation is recorded in [LEARNINGS.md](../../LEARNINGS.md).
Existing quality guidance already requires exact owning-decision discrimination, and coordination guidance already requires explicit execution ownership, artifact verification, local dependency resolution and cumulative reconciliation.
Those recurring observations do not justify another copy of the same rules.
Current contract corrections belong in the owning crate/root guides; the deferred semantic choice belongs in Decision 0030 and Known Issues.
The [skill review](skill-review.md) records why no reusable workflow change is needed.
The isolated admission-versus-shedding review finding reinforces the existing owning-decision rule rather than requiring a new review procedure.

## Open Questions

- Which public error representation should preserve both initiating failure classification and failed cleanup?
- What stage or scheduling condition causes the intermittent native durable-opening timeout?
- Would a narrower browser prerequisite setup reduce validation cost in future fresh checkouts?
  No baseline was measured here, so no speedup is claimed.
