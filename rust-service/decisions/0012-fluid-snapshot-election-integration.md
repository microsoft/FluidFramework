# Decision 0012: Snapshot Participation and Fluid Election

Status: accepted
Date: 2026-09-16
Iteration: lightweight
Owners: interactive user and GitHub Copilot
Supersedes: none
Superseded by: none

## Context

Sea can simplify applications by selecting one snapshot publisher and granting it a fenced publication capability.
Some applications already have an authoritative election that Sea cannot replace cleanly.
Fluid is one such application: `SummarizerClientElection` elects an interactive parent, which launches a separate summarizer client through `SummaryManager`.
The summarizer uploads according to Fluid's existing client-side cadence policy.

## Decision Drivers

- Applications must be able to choose Sea-managed selection, client-managed selection, or no publication authority.
- Sea and an application must not independently elect publishers for the same active snapshot stream.
- Sea nomination grants publication authority; it must never request or schedule summary generation.
- Sea-managed publication must remain fenced and deterministic.
- Client-managed publication must preserve expected-parent conflict detection and stable operation recovery.
- Fluid's existing election, heuristics, and parent/child summarizer lifecycle must remain authoritative.

## Options and Evidence

- Require every publisher to use Sea selection.
  This is simple for direct integrations but requires a new Fluid container-runtime election seam and delegated fencing between Fluid's parent and summarizer child.
  It is rejected as the only policy because it does not accommodate applications with an existing authoritative election.
- Allow unconditional publication without declaring who owns selection.
  This makes permissions ambiguous and can accidentally bypass Sea fencing, so it is rejected.
- Declare one immutable participation policy when opening each snapshot stream.
  This keeps publication permission explicit and lets applications select the appropriate authority model.
  This option is selected.

## Decision

Each snapshot stream opens with exactly one immutable `SnapshotParticipation` policy:

- `ReadOnly` receives latest-value coordination but cannot publish.
- `SeaSelected` may publish only while holding Sea's current nomination fence.
- `ClientSelected` may publish without a Sea fence because the client application owns election and scheduling.

If any active `ClientSelected` stream exists, Sea grants no `SeaSelected` fence and revokes an existing Sea nomination.
When the last `ClientSelected` stream leaves, Sea deterministically selects one active `SeaSelected` stream if available.
`ReadOnly` streams never participate in selection.

The regular `SeaDriver` uses `ClientSelected`, preserving Fluid's existing `SummarizerClientElection`, parent/child lifecycle, and cadence heuristics without a new container-runtime seam.
Direct SharedTree integration uses `SeaSelected` and benefits from Sea's simpler election.
All modes receive accepted-snapshot notifications.

Client-selected publication still requires the stream's active session authority, stable operation identity, expected parent, event boundary, and content root.
Multiple client-selected sessions may race; storage accepts at most the publication satisfying the expected-parent condition.
Sea-selected publication requires the current fence.

## Consequences

The standard Fluid driver and runtime interfaces remain unchanged.
Applications using `ClientSelected` own publisher availability: while any such stream is active, Sea intentionally does not provide fallback selection.
If that application fails to elect or schedule a publisher, snapshots stop until it recovers or every client-selected stream disconnects.

The protocol distinguishes client-selected publication from Sea-selected fenced publication, preventing an omitted fence from silently bypassing Sea election.
Participation changes require reopening the snapshot stream.

## Validation and Follow-Up

Test all three permission modes, Sea-selection suppression and fallback, stale fence rejection, multiple client-selected expected-parent conflicts, connection-loss cleanup, and ambiguous publication resolution.
Run direct SharedTree with `SeaSelected` and the regular `SeaDriver` with `ClientSelected`.
Verify that changing Fluid summary cadence requires no Sea protocol change.
