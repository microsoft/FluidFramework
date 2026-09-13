# Iteration 0007 Retrospective

## What We Expected

We expected two dependency-independent workstreams: document-service state would be sufficient for Fluid read-to-write replacement, and native server ownership would be sufficient for bounded shutdown. Both should integrate without path conflicts, then jointly define the prerequisite contract for a later streaming iteration.

## What We Observed

Both hypotheses were supported after local defects were corrected. Reconnect required more than cursor transfer: stable logical membership, deterministic history/live envelopes, client-scoped sequence translation, and callback-order buffering were all necessary. Shutdown required the server future to remain polled while control acknowledgements were awaited. Production membership and browser-observed graceful QUIC close remain inconclusive. Integration was conflict-free and required no dependency or lockfile change.

## Costly Issues and Dead Ends

For each substantial effort sink, record the trigger, attempted approaches, evidence that stopped the work, approximate impact, root cause if known, and prevention or faster diagnostic for next time. Use `none` only after reviewing all workstream notable-event tables.

- The [Fluid lifecycle report](phase-2/fluid-read-reconnect-lifecycle.md#notable-events) records four narrowing failures before Chromium convergence. Approximate coordinator recovery and diagnosis impact was 33 minutes. Faster diagnostic: capture replacement mode, connection identities, client/server sequence fields, and close telemetry before changing payload handling.
- The [shutdown report](phase-2/native-graceful-shutdown.md#notable-events) records the Tokio feature lockfile conflict and the acknowledgement deadlock. Approximate workstream impact was several focused attempts within an 18-minute workstream. Faster diagnostic: run `cargo test --locked` immediately after feature edits and use a no-client control smoke test before Chromium.
- A delegated lifecycle agent stopped after a successful dependency build with uncommitted trace/report changes. Exact worktree, process, build-log, status, and report-marker inspection allowed safe continuation without discarding work.
- Integration setup initially used Node 24 and failed Routerlicious engine constraints. The user identified nvm Node 22; `22.23.2` completed targeted installation cleanly. A broad aborted install touched one unrelated lockfile metadata line, which was identified and removed before validation.

## Agentic Development Findings

Decomposition and path ownership were correct: commits cherry-picked without conflict. Instructions correctly forbade streaming in either workstream, preventing a cross-boundary third implementation from entering Phase 2. The shutdown agent completed autonomously with a strong report. The lifecycle handoff was incomplete, but retained logs and report provenance made recovery reliable. Direct command evidence remained necessary when execution helpers exhausted budgets or omitted outputs. Human intervention was limited to approving iteration sequencing and pointing to nvm Node 22.

## Practices to Keep, Change, or Stop

- Keep: independent worktrees, immutable kickoff, explicit writable paths, and report-first provenance. Owner: coordinator.
- Keep: generated-WASM Node plus real Chromium evidence; each found defects invisible to the other. Owner: workstream instructions.
- Change: record required Node major beside commands for nested workspaces with stricter engines. Owner: next iteration instruction author.
- Change: on delegated interruption, inspect branch/HEAD, running processes, retained logs, dirty paths, and report markers before resuming. Owner: coordinator.
- Stop: broad `--install` validation when a targeted package/dependency install is available. Owner: validator.

## Durable Lessons

Promoted three confirmed lessons: replacement streams need deterministic shared history/live projection and client-scoped ordering; control acknowledgement requires continued polling of the owned long-running future; interrupted workstreams should be recovered from observed repository/process evidence. Each applies beyond the specific fixture and is linked to retained workstream evidence.

## Open Questions

- What FSP4 streaming frame provides atomic catch-up plus tail without missing an append at the boundary?
- Should backpressure block projection reads, use a bounded queue with explicit overflow, or terminate with a resumable cursor?
- How should cancellation distinguish client unsubscribe, transport loss, server deadline, and terminal service error?
- What authoritative membership contract replaces synthetic members for multiple concurrent read-first writers?
- Can `wtransport` refuse new handshakes while preserving existing sessions, or is application-level admission the strongest available contract?
