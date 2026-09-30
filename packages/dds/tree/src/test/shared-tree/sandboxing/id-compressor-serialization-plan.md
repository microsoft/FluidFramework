# ID-Compressor Serialization Plan for the Sandbox Demo

## Goal and scope

Give the Guest an independent, serialized ID space shard of the Host's ID compressor instead of passing the Host's live compressor object to it.
Make the complete initialization payload, including the compressor state, compatible with `MessagePort`.
Keep Host and Guest changes, including changes that mint IDs after initialization, interoperable without shared JavaScript objects.

This is a design proposal, not a description of supported behavior.
It does not complete the separate timeline, fault-isolation, and production security work in [sandboxing.md](./sandboxing.md).

## Working practices

- Write focused tests and document the intended behavior before implementing each checklist item.
  Use failing tests to identify gaps, then verify that the implementation makes them pass without changing unrelated behavior.
- Update this checklist and the relevant documentation as behavior changes.
  Mark an item complete only after its implementation and tests are verified.
- Follow the [Coding Guidelines](../../../../../../../docs/content/Guidelines/Coding-Guidelines.md) and [Documentation Guidelines](../../../../../../../docs/content/Guidelines/Documentation-Guidelines.md), including the linked TypeScript documentation guidance.
  Use API documentation for contracts and inline comments for reasoning, assumptions, or invariants that might not be clear to a developer reading the code for the first time.
- Run focused tests, type-checking, formatting, and linting for each implementation slice.
  Run broader validation when the focused checks do not cover a behavior change.

## Current state and dependencies

- [PR 27559](https://github.com/microsoft/FluidFramework/pull/27559) added V3 ID space sharding.
  `IIdCompressorCore.shard(1)` returns a serialized child ID space shard with an ongoing session.
  `deserializeIdCompressor(serialized, SerializationVersion.V3)` creates an independent compressor with the same session ID.
  The parent can learn a child's generated IDs with `getShardSyncToken()` and `synchronizeWithShard()`; `disposeShard()` produces a final token that also permits reclamation.
- [PR 28330](https://github.com/microsoft/FluidFramework/pull/28330) is merged.
  The Host sends `hostInitialization` through the port with a compressed snapshot at the finalized-history boundary, the persisted schema, and ordered retained commits.
  Its `hostUpdate` messages carry branch transitions and commits instead of corrective net changes.
  [Guest.create](./guest.ts) asynchronously receives initialization, replays commits into a hidden Host branch, forks an authoring view, and rebases it over Host updates.
  [HostSynchronization](./hostSynchronization.ts) tracks the Guest's authoring branch and merges Guest changes into the application's main branch.
- `guestChange` contains `changeId`, `mainRevision`, `trunkRevision`, and the serialized change.
  `hostUpdate` contains `updateId`, `baseRevision`, `mainRevision`, `trunkRevision`, and ordered serialized commits.
  The version 2 serialized commit format preserves custom metadata.
- The current [sandboxingTestUtils.ts](./sandboxingTestUtils.ts) still passes the Host's live compressor to both `HostOptions` and `GuestOptions` through `SandboxEndpointOptions`.
  The initialization message does not include compressor state.
  The test provider creates a V3 compressor, but a real Host must check that its compressor supports sharding.
- `UntypedTreeViewAlpha.applyChange` currently documents that the producer and receiver must use the **same ID-compressor instance**.
  Its implementation checks the session ID in the change envelope, but that check alone does not establish that different compressors can decode every ID in the change.
  Cross-instance support needs explicit tests and an update to the API contract when proven.

Build on this full-duplex protocol.
Do not introduce a second initialization protocol or revert to corrective changes.

### Compatibility test results

[idCompressorCompatibility.spec.ts](./idCompressorCompatibility.spec.ts) characterizes the current cross-instance behavior.
A separately deserialized Guest ID space shard reads the initial compressed tree and replays a Host commit serialized before ID space sharding.
A Guest-authored change is rejected by the Host checkout until it applies a child synchronization token; the same change then applies.
A Host commit minted beyond the child ID space shard's known ID range, or a peer commit finalized after ID space sharding, is rejected by the Guest checkout with an unknown ID.
The expected-failure cases use the checkout's `applyChange` method, which exercises the same change decoder without breaking the public view when decoding fails.
These tests do not replace end-to-end validation of the full-duplex protocol.
Serialized Guest initialization now uses a distinct child through `MessagePort`.
Guest changes carry the child's progress to the Host before it decodes them.
Host and peer updates can still fail with an unknown ID until Host-to-Guest progress synchronization is added.

The compatibility tests identified two gaps that a serialized ID space shard alone does not solve:

1. **Addressed:** The Host synchronizes with the Guest ID space shard **before** decoding a Guest change that refers to newly generated IDs.
2. **Remaining:** The Guest must learn IDs generated by the Host and finalized ranges learned by the Host **after** the initial ID space shard snapshot.
   The current ID space sharding API synchronizes child-to-parent only.
   A Host-originated commit after ID space sharding can contain IDs that the Guest ID space shard does not know.
   The initial ID space shard snapshot must also cover all retained commits replayed during initialization.
   Sending another serialized root compressor does not update the compressor already held by the Guest's checkout.

## Project checklist

Check an item only when its stated behavior is implemented and verified.
The completed compatibility tests characterize today's behavior; they do not imply that the sandbox protocol supports separate compressors yet.

### Foundation and compatibility

- [x] Establish the full-duplex `hostInitialization`, `guestChange`, and `hostUpdate` message path as the baseline for this work.
- [x] Verify that a compressed baseline loads with an independently deserialized child ID space shard.
- [x] Verify that a retained Host commit encoded before ID space sharding replays with the child ID space shard.
- [x] Verify that a Guest change fails without child-to-parent synchronization and applies after the Host synchronizes the child ID space shard token.
- [x] Reproduce the missing-ID failures for a later Host commit and a peer commit finalized after ID space sharding.

### Serialized Guest initialization

- [x] Reject a Host compressor that cannot create an ID space shard, including a write version below V3.
- [x] After preparing the baseline snapshot and retained commits, create a serialized ongoing-session child ID space shard without replacing the Host runtime compressor.
- [x] Add and validate the serialized child state in `hostInitialization`; preserve the existing transport encoding and handle rules.
- [x] Remove the shared compressor from `SandboxEndpointOptions` and `GuestOptions`, keep the root on `HostOptions`, and stop passing the root to the Guest in [sandboxingTestUtils.ts](./sandboxingTestUtils.ts).
- [x] Deserialize the child ID space shard before constructing the Guest's Host-branch view or replaying retained commits; terminate the session on invalid initialization.
- [x] Test the full initialization envelope through `MessagePort`, including retained history, metadata, and a separate Guest compressor.

### Guest-to-Host ID progress

- [x] Include a non-disposing child ID space shard synchronization token in each `guestChange`, captured after encoding the change.
- [x] Validate the ID space shard token's shape, ownership, and progress, then synchronize the Host compressor before decoding or applying the Guest change.
- [x] Verify Guest changes and acknowledgments through the full-duplex protocol with separate compressors, including invalid and delayed tokens.

### Host-to-Guest ID progress

- [x] Add an internal parent-progress API that updates a live child ID space shard without changing its stride; use existing `finalizeCreationRange` for ordered finalized ranges.
- [x] Expose finalized-range notifications on the runtime's ID compressor so the Host can observe them without test-only provider state or a sandbox call to `takeNextCreationRange()`.
- [x] Deliver parent progress with Host updates and finalized ranges ahead of dependent commits and revision checks, without replacing the Guest compressor or changing its ID space shard stride. The initialization snapshot already includes the Host's prior compressor state.
- [x] Verify Host edits beyond the child ID space shard's backfilled range, newly finalized peer edits, finalized ranges without tree edits, and updates that only advance `trunkRevision`.
- [x] Verify ordered delivery when a finalized range and Host update are delayed behind an in-flight Guest edit, and reject invalid, backward, out-of-order, and repeated compressor updates.

### Session lifecycle

- [ ] Define an orderly close path that stops Guest ID generation, disposes its hidden Host branch and authoring view, and sends an ID space shard disposal token after outstanding changes.
- [ ] Synchronize the disposal token on the Host only after those changes are processed; acknowledge reclamation if the application needs confirmation.
- [ ] On transport loss, do not reclaim an ID space shard until the Guest is known to be stopped; document or bound the cost of unreclaimed replacement sessions.
- [ ] Test normal disposal, failure, and application-managed Guest replacement with messages in flight

### End-to-end verification and documentation

- [ ] Re-run the full-duplex synchronization schedules with separate compressors and post-initialization ID generation in both directions.
- [ ] Verify that handles, commit metadata, retained history, revertibles, undo/redo, and branch rebases still work.
- [ ] Add an isolated worker or iframe test that does not share JavaScript globals.
- [ ] Update the `UntypedTreeViewAlpha.applyChange` contract after cross-instance behavior is supported.
- [ ] Update [sandboxing.md](./sandboxing.md) to describe the implemented ID-sharding path and narrow its remaining work.
- [ ] Run the relevant type-check, formatting, lint, and test commands for the completed implementation.


### Potential `id-compressor` API follow-up

- Evaluate whether ID space sharding should provide a way to reclaim a child ID space shard that was created but never sent, without deserializing it.
  `shard(1)` returns serialized child ID space shard state, not a live child ID space shard or a disposal token.
  If sending `hostInitialization` throws synchronously, [Host](./host.ts) currently deserializes that state only to call `disposeShard()` and synchronize the resulting token back into the root.
  Consider an API for this unsent-child case after reviewing usage and lifecycle guarantees; do not reclaim an ID space shard that might already be running in the Guest.

## Protocol and lifecycle

### 1. Serialized Guest initialization

The `hostInitialization` message contains the snapshot tree, persisted schema, baseline revision, main and trunk revisions, retained commits, and a serialized ongoing-session child ID space shard.
After [HostSynchronization](./hostSynchronization.ts) serializes the retained commits and [Host](./host.ts) prepares the baseline snapshot, the Host calls `shard(1)` on its runtime compressor and sends the child ID space shard through the existing transport pipeline.
The Host rejects compressors that cannot create an ID space shard and reclaims the child ID space shard if sending initialization fails synchronously.
The runtime keeps the root compressor.

[Guest.create](./guest.ts) receives and validates the message through `MessagePort`.
The Guest rejects invalid serialized state and root compressors, then deserializes the child ID space shard before constructing its Host-branch view and replaying commits.
`GuestOptions` and [sandboxingTestUtils.ts](./sandboxingTestUtils.ts) no longer pass the Host's compressor into the Guest.
Initialization failures terminate the session through [SandboxSessionEndpoint](./session.ts).
Future compressor updates must arrive before any retained or new commit that depends on them.

### 2. Send Guest ID progress with changes

After `getChange()` encodes a Guest edit, the Guest captures a non-disposing ID space shard synchronization token and includes it in `guestChange`.
The message schema checks the token's session ID, safe-integer generation count, non-disposing state, and exact fields.
The Host compares the ID space shard ID with the child ID space shard created for this session and rejects non-increasing progress.
It calls `synchronizeWithShard(token)` before `local.applyChange(message.change)`, binding handles, merging, or sending `guestChangeAck`.
The existing change IDs, acknowledged `mainRevision` and `trunkRevision` checks, commit metadata, message directions, and error-handling rules remain in place.
Resource limits for very large progress jumps remain part of [sandboxing.md](./sandboxing.md)'s protocol-hardening work.

### 3. Send Host ID progress to the live Guest

The ID-compressor library provides `getChildShardProgress` on a parent and `synchronizeWithParent` on a live child.
This updates the child's knowledge of Host-generated IDs without replacing the child compressor or changing its allocation stride.
The parent's `rangeFinalized` event reports each creation range after finalization succeeds.
The Guest can apply these ranges in order through the existing `finalizeCreationRange` method.
Unit tests cover parent and child edits, local and remote finalized ranges, token ownership, and invalid progress.
The Host subscribes to finalized-range events and sends each range as `hostIdRange` immediately in runtime order.
Each range message includes parent progress, which the Guest applies before finalizing the range.
Host branch updates include parent progress captured after encoding their commits.
The Guest applies this progress before it decodes the commits or checks branch revisions.
The serialized child already includes the compressor state needed for retained initialization commits.
The Guest rejects unexpected or repeated range IDs, invalid finalized ranges, progress for another ID space shard, and progress that moves backward.
Focused relay tests delay a peer range and its dependent Host update while a Guest edit is in flight.
The deterministic synchronization schedules also exercise interleaved delivery.
Preserve the Host-branch copy and Guest-side rebase; do not generate corrective net changes as a workaround.
Do not call `takeNextCreationRange()` merely to construct a sandbox update: range submission and finalization belong to the runtime.

This step requires an API-design investigation.
An early test should create a child ID space shard, mint an ID on the Host after ID space sharding, and apply a Host-generated serialized change to the Guest without first advancing the Guest.
Repeat with an ID from a peer whose creation range is finalized after ID space sharding.
Also test a retained Host commit that is replayed during initialization.
Use the failures to specify the smallest safe parent-to-child compressor API.

### 4. Close and recreate sessions safely

On orderly Guest shutdown, stop sending edits, dispose both its hidden Host branch and its authoring view, and call `disposeShard()` on the ID space shard only when no retained Guest reference can generate more IDs.
Send the disposal token after outstanding Guest changes.
Once the Host has processed those changes, it synchronizes the disposal token and can reclaim the ID space shard's allocation space.
An orderly close may need an asynchronous handshake: the current synchronous `Guest.dispose()` closes the port, so it cannot by itself send and confirm a final token.
Define a close acknowledgment if the application needs confirmation that reclamation completed.

On transport loss or uncertain Guest termination, do **not** reclaim its ID space shard while it might still generate IDs.
Report the failure and use application-level termination or fencing before reclamation.
Document and bound the cost of unreclaimed sessions: repeated ID space sharding increases the allocation stride and has a limit.
Keep the existing rule that disposing the Host does not dispose the application's main view.

## Completion criterion

The work is complete only when both edit directions work across separate JavaScript realms **without** sharing a compressor instance, and the complete initialization payload crosses the port.
Passing only the initial-tree test does not meet this criterion.
