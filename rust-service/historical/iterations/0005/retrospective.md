# Iteration 0005 Retrospective

## What We Expected

We expected four deliverables in dependency waves: projected reads/recovery first, isolated blob and WASM groundwork in parallel, protocol consumers after accepted handoffs, and the minimal driver last. We expected Node to validate portable WASM behavior and Chromium to validate browser transport, while root workspace and lockfile changes remained integration-owned.

## What We Observed

All four workstreams integrated without kernel changes. Projection, explicit recovery, durable blobs/summaries, the portable WASM package, and the selected Fluid driver interfaces passed their scoped checks. Content and recovery semantics remained bounded and explicit. The negative result was architectural: a second Chromium WebTransport session could not handshake while the first remained connected because the native accept loop awaits each connection. Two logical clients over one session passed, but independent-session support remains inconclusive.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- Delegated commands repeatedly summarized the wrong sibling worktree or omitted exact evidence. Absolute checkout identity, direct artifact execution, fresh target directories, and compact reruns recovered trustworthy results.
- Reusing a Cargo target across sibling worktrees mixed stale path-package fingerprints and produced impossible compiler errors. Fresh checkout-specific targets passed.
- Delegated WASM generation reported success while browser bindings remained stale. Checking generated exports exposed the mismatch; direct regeneration from the Node-tested release WASM made Chromium pass.
- A new content process test collided because temporary resource names used only the parent PID. Adding a per-test suffix restored parallel test isolation.
- Registered driver typechecking initially failed because Fluid dependency build metadata existed without generated declarations. A forced build of `packages/common/driver-definitions` materialized both dependency declaration trees; the package then passed typecheck, build, and tests.
- The first true two-session Chromium check failed at the second handshake. Inspection of the native accept loop established the prerequisite limitation early enough to preserve a truthful single-session trace rather than weakening scope silently.

Supporting evidence is in [Phase 2 integration](phase-2/integration.md) and the four reports under [phase-2](phase-2/).

## Agentic Development Findings

Dependency waves prevented provisional wire contracts from diverging, and central registration kept shared manifests coherent. The user corrected an initial assumption that the four deliverables were independently parallel, required Node tests to avoid implying Node WebTransport support, accepted the Phase 2 limitation explicitly, and selected concurrency followed by SharedTree for iteration `0006`. The largest avoidable cost remained untrustworthy delegated checkout routing and summaries that omitted requested counts. Direct identity and artifact checks were more reliable than tool narration.

## Practices to Keep, Change, or Stop

- **Keep:** dependency-ordered worktrees, integration-owned lockfiles, explicit ambiguity, actual-WASM Node tests, and authoritative Chromium traces. The coordinator owns enforcement.
- **Keep:** generated artifacts ignored and reproducible from committed source and instructions.
- **Change:** run a cheap prerequisite capability probe before dispatching a consumer whose core hypothesis depends on concurrency or another runtime property. The coordinator owns the kickoff check.
- **Change:** generated-artifact validation must inspect or execute the exact output; a command summary alone is not evidence. Each workstream owner records provenance.
- **Change:** never reuse Cargo targets across sibling worktrees, even when package names match. Each command gets a checkout-specific target.
- **Stop:** accepting delegated results that omit checkout identity, exact test counts, or generated-artifact provenance.

## Durable Lessons

[LEARNINGS.md](../../LEARNINGS.md) now records that projected pagination must advance across filtered canonical spans, immutable summary acknowledgement requires durable verified references, consumer work should probe prerequisite runtime capabilities before dispatch, and generated or cached build state must be verified by the artifact needed downstream. These findings generalize to future protocols, storage adapters, browser consumers, and multi-worktree builds.

## Open Questions

- Can the native server spawn accepted sessions concurrently while preserving the non-`Send` fence through replay, validation, append, and shutdown?
- What minimal SharedTree/container configuration exercises real collaboration without expanding the driver into Routerlicious or ODSP compatibility?
- Does the current capacity-one WASM request queue need one client per Fluid connection once independent browser sessions exist?
- Which retention roots and leases are required before content garbage collection can be designed safely?
- Should reproducible WASM package publication become a separate workstream after the consumer contract stabilizes?
