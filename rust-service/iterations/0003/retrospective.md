# Iteration 0003 Retrospective

## What We Expected

We expected three disjoint workstreams to test the last process-boundary uncertainties: deployment fencing, abrupt process recovery, and process-isolated transport. Each was required to use actual OS processes, explicit bounded synchronization, immutable shared state, and separate implementation/report commits.

## What We Observed

All three implemented real child-process evidence without changing the kernel or lockfile. Same-host fencing, Linux process termination, and Unix transport worked within documented limits. Review corrected one codec contract violation before integration. Multi-host fencing, power loss, Windows IPC, authentication, and product assembly remain intentionally unresolved.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- The first parallel dispatch used a read-only exploration agent and produced only suggested code, no files or commits. The coordinator rejected all three outputs and redispatched clean branches to coding agents.
- Delegated validation again returned sibling or incorrect checkout identities. Reports and integration rejected those results and reran guarded commands with absolute paths and isolated targets.
- Process transport initially deferred malformed/foreign token rejection until async read. Review compared it with Decision 0005, and commits `385f2c0411d..882d1ef74d5` added an envelope and shared conformance.
- The first workspace gate stopped on formatting only; `bab24992d7a` applied canonical formatting and the repeated full gate passed.

## Agentic Development Findings

Path decomposition was effective and all implementation commits cherry-picked without conflict. Instructions correctly demanded real processes and bounded waits, but agent selection initially contradicted the task because the chosen explorer was read-only. Reports captured actual kickoff provenance and limitations. The user made the Phase 3 scope decisions: accept same-host fencing and current process-crash evidence, then move toward service assembly and full native/browser WebTransport while adding encryption and stateful compression.

## Practices to Keep, Change, or Stop

- **Keep:** disjoint worktrees, exact kickoff provenance, immutable lockfiles, and guarded direct validation.
- **Keep:** direct shared conformance against each newly applicable implementation during review and integration.
- **Change:** use write-capable coding agents for implementation work; reserve exploration agents for read-only audits. The coordinator owns dispatch selection.
- **Change:** define dependency waves in the charter even when all branches share a kickoff; dependent work starts only after its prerequisite artifact is available or uses a predeclared stable boundary.
- **Stop:** accepting a report's semantic claim without checking it against accepted decision records and conformance helpers.

## Durable Lessons

[LEARNINGS.md](../../LEARNINGS.md) records that a fence must cover semantic validation through append, client-verifiable token envelopes preserve synchronous codec laws across process boundaries, and implementation agents must have write-capable tools. These lessons apply beyond the specific prototypes.

## Open Questions

- Can native and browser WebTransport clients share one byte protocol while using separate target-specific transport stacks?
- What service/factory boundary is sufficient for multiple documents and a runnable deployment without entering full Fluid-driver scope?
- How should pending native submissions expose ambiguity, reconnect, and regeneration without hidden retries?
- Can stateful compression restart solely from snapshot-bound state without coupling the kernel to codecs?
- Which key identity, nonce derivation, rotation, and corruption semantics keep encryption transparent and misuse-resistant?
- Which benchmark workloads remain equivalent across memory, file, durable, Unix, WebTransport, compressed, and encrypted paths?
