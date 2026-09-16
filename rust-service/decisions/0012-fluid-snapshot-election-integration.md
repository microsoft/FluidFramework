# Decision 0012: Fluid Snapshot Election Integration

Status: proposed
Date: 2026-09-16
Iteration: lightweight
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

Sea selects at most one eligible connected session as snapshot publisher and grants that session a fenced publication capability.
Fluid already runs `SummarizerClientElection`, which elects an interactive parent.
That parent launches a separate non-interactive summarizer client through `SummaryManager`, and the summarizer uploads through `IDocumentStorageService.uploadSummaryWithContext` according to Fluid's existing client-side cadence policy.

The standard `IDocumentService`, `IDocumentDeltaConnection`, and storage interfaces do not expose a reverse channel for driver nomination state.
`ContainerRuntime` constructs `SummarizerClientElection` internally, so `SeaDriver` cannot currently supply nomination without starting a second independent election.

## Decision Drivers

- Fluid and Sea must not independently elect competing summarizers.
- Sea nomination grants publication authority; it must never request or schedule summary generation.
- Fluid's existing heuristics and parent/child summarizer lifecycle must remain authoritative for cadence.
- Publication must stop on nomination loss, disconnect, or stale fencing authority.
- The separate summarizer client needs explicit authority to upload on behalf of its nominated parent.
- Standard driver interfaces should not acquire Sea-specific members.

## Options and Evidence

- Nominate the actual summarizer session.
  This avoids delegation, but the session does not exist until Fluid's independent parent election launches it.
  During graceful handoff two summarizer sessions may overlap, leaving Sea to perform a second election whose result can disagree with Fluid's `electedClientId`.
  This option is rejected.
- Run a driver-local parent election and leave Fluid's election unchanged.
  `IDocumentService` and `IDocumentDeltaConnection` cannot feed that result into `SummaryManager`, so this creates competing authority and is rejected.
- Nominate the interactive parent and adapt Fluid's existing election to consume Sea nomination.
  `SummaryManager` already starts and stops the child according to `electedParentId`, making this the smallest semantic seam and preserving one parent election.
  This option is selected.

## Decision

Sea nominates the interactive Fluid parent responsible for launching the summarizer.
Fluid's `SummaryManager` remains responsible for launching the separate summarizer client, and Fluid's existing summary heuristics remain solely responsible for deciding when to summarize.
Sea nomination is authority selection, not a summary request.

`ISummarizerClientElection` remains the runtime-facing contract.
Container runtime construction must accept an internal election factory or nomination provider that can produce an `ISummarizerClientElection` backed by Sea coordination.
The default remains `SummarizerClientElection`; Sea integration replaces that election for the Sea driver rather than wrapping it with another independent result.
No Sea-specific member is added to `IDocumentService` or `IDocumentDeltaConnection`.

The nominated parent delegates its current Sea fence to the child summarizer through an explicit, bounded capability tied to the parent session, child session, archive, and current fence.
The child publishes only while that delegation and fence remain current.
Nomination loss, parent disconnect, child disconnect, or replacement revokes the delegation.
Publication resolution may report an already accepted operation, but stale authority cannot authorize a new publication.

## Consequences

This requires coordinated changes outside `rust-service`: an internal container-runtime election injection contract, an implementation that consumes asynchronous Sea nomination, and parent-to-summarizer delegation plumbing.
It also requires Sea protocol/client/sequencer support for delegated fenced publication.
The standard driver interfaces remain unchanged, but the container-runtime integration contract is shared cross-package API surface and needs explicit approval before implementation.

The model preserves Fluid's parent/child handoff and cadence behavior.
It adds delegation complexity, but avoids a second election and makes publication authority auditable at the actual uploader.

## Validation and Follow-Up

Before implementation, approve the internal container-runtime injection contract and delegated-fence protocol shape.
Then test parent nomination transfer, child delegation and revocation, non-nominated publication rejection, unresponsive-parent replacement, stale delegated fences, ambiguous publication resolution, and cadence changes driven only by Fluid client policy.
Run the SharedTree Chromium workflow with summaries enabled and verify that one authoritative election controls each publication.
