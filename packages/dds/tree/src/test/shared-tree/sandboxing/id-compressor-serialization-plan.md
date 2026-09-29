# ID-Compressor Serialization Plan for the Sandbox Demo

## Goal and scope

Give the Guest an independent, serialized ID-compressor shard instead of passing the Host's live compressor object to it.
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

- [PR 27559](https://github.com/microsoft/FluidFramework/pull/27559) added V3 sharding.
  `IIdCompressorCore.shard(1)` returns a serialized child with an ongoing session.
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
A separately deserialized Guest shard reads the initial compressed tree and replays a Host commit serialized before sharding.
A Guest-authored change is rejected by the Host checkout until it applies a child synchronization token; the same change then applies.
A Host commit minted beyond the child's known ID range, or a peer commit finalized after sharding, is rejected by the Guest checkout with an unknown ID.
The expected-failure cases use the checkout's `applyChange` method, which exercises the same change decoder without breaking the public view when decoding fails.
These tests do not replace end-to-end validation of the full-duplex protocol.
Serialized Guest initialization now uses a distinct child through `MessagePort`.
Until ID progress synchronization is added, existing Guest and peer edit tests can fail with an unknown ID.

Two gaps make a serialized shard alone insufficient:

1. The Host must synchronize with the Guest shard **before** decoding a Guest change that refers to newly generated IDs.
2. The Guest must learn IDs generated by the Host and finalized ranges learned by the Host **after** the initial shard snapshot.
   The current sharding API synchronizes child-to-parent only.
   A Host-originated commit after sharding can contain IDs that the Guest shard does not know.
   The initial shard snapshot must also cover all retained commits replayed during initialization.
   Sending another serialized root compressor does not update the compressor already held by the Guest's checkout.

## Project checklist

Check an item only when its stated behavior is implemented and verified.
The completed compatibility tests characterize today's behavior; they do not imply that the sandbox protocol supports separate compressors yet.

### Foundation and compatibility

- [x] Establish the full-duplex `hostInitialization`, `guestChange`, and `hostUpdate` message path as the baseline for this work.
- [x] Verify that a compressed baseline loads with an independently deserialized child shard.
- [x] Verify that a retained Host commit encoded before sharding replays with the child shard.
- [x] Verify that a Guest change fails without child-to-parent synchronization and applies after the Host synchronizes the child token.
- [x] Reproduce the missing-ID failures for a later Host commit and a peer commit finalized after sharding.

### Serialized Guest initialization

- [x] Reject a Host compressor that cannot shard, including a write version below V3.
- [x] After preparing the baseline snapshot and retained commits, create a serialized ongoing-session child shard without replacing the Host runtime compressor.
- [x] Add and validate the serialized child state in `hostInitialization`; preserve the existing transport encoding and handle rules.
- [x] Remove the shared compressor from `SandboxEndpointOptions` and `GuestOptions`, keep the root on `HostOptions`, and stop passing the root to the Guest in [sandboxingTestUtils.ts](./sandboxingTestUtils.ts).
- [x] Deserialize the child before constructing the Guest's Host-branch view or replaying retained commits; terminate the session on invalid initialization.
- [x] Test the full initialization envelope through `MessagePort`, including retained history, metadata, and a separate Guest compressor.

### Guest-to-Host ID progress

- [ ] Include a non-disposing child synchronization token in each `guestChange`, captured after encoding the change.
- [ ] Validate token shape, ownership, and progress, then synchronize the Host compressor before decoding or applying the Guest change.
- [ ] Verify Guest changes and acknowledgments through the full-duplex protocol with separate compressors, including invalid and delayed tokens.

### Host-to-Guest ID progress

- [ ] Determine the smallest supported way to update a live child with Host-generated IDs and ordered finalized ranges; use existing ID-compressor APIs where sufficient and add an internal API only where necessary.
- [ ] Identify a runtime source for finalized-range updates that does not depend on test-only provider state or call `takeNextCreationRange()` for sandbox messages.
- [ ] Deliver compressor updates before dependent initialization commits, Host updates, and revision checks, without replacing the Guest compressor or changing its shard stride.
- [ ] Verify Host edits beyond the child's backfilled range, newly finalized peer edits, and updates that only advance `trunkRevision`.
- [ ] Verify ordering with concurrent Guest edits, interleaved or delayed messages, and invalid or stale compressor updates.

### Session lifecycle

- [ ] Define an orderly close path that stops Guest ID generation, disposes its hidden Host branch and authoring view, and sends a disposal token after outstanding changes.
- [ ] Synchronize the disposal token on the Host only after those changes are processed; acknowledge reclamation if the application needs confirmation.
- [ ] On transport loss, do not reclaim ID space until the Guest is known to be stopped; document or bound the cost of unreclaimed replacement sessions.
- [ ] Test normal disposal, failure, and application-managed Guest replacement with messages in flight

### End-to-end verification and documentation

- [ ] Re-run the full-duplex synchronization schedules with separate compressors and post-initialization ID generation in both directions.
- [ ] Verify that handles, commit metadata, retained history, revertibles, undo/redo, and branch rebases still work.
- [ ] Add an isolated worker or iframe test that does not share JavaScript globals.
- [ ] Update the `UntypedTreeViewAlpha.applyChange` contract after cross-instance behavior is supported.
- [ ] Update [sandboxing.md](./sandboxing.md) to describe the implemented ID-sharding path and narrow its remaining work.
- [ ] Run the relevant type-check, formatting, lint, and test commands for the completed implementation.


### Potential `id-compressor` API follow-up

- Evaluate whether sharding should provide a way to reclaim a child that was created but never sent, without deserializing it.
  `shard(1)` returns serialized child state, not a live child or a disposal token.
  If sending `hostInitialization` throws synchronously, [Host](./host.ts) currently deserializes that state only to call `disposeShard()` and synchronize the resulting token back into the root.
  Consider an API for this unsent-child case after reviewing usage and lifecycle guarantees; do not reclaim a child that might already be running in the Guest.

## Protocol and lifecycle

### 1. Serialized Guest initialization

The `hostInitialization` message contains the snapshot tree, persisted schema, baseline revision, main and trunk revisions, retained commits, and a serialized ongoing-session child compressor.
After [HostSynchronization](./hostSynchronization.ts) serializes the retained commits and [Host](./host.ts) prepares the baseline snapshot, the Host calls `shard(1)` on its runtime compressor and sends the child through the existing transport pipeline.
The Host rejects compressors that cannot shard and reclaims a child if sending initialization fails synchronously.
The runtime keeps the root compressor.

[Guest.create](./guest.ts) receives and validates the message through `MessagePort`.
The Guest rejects invalid serialized state and root compressors, then deserializes the child before constructing its Host-branch view and replaying commits.
`GuestOptions` and [sandboxingTestUtils.ts](./sandboxingTestUtils.ts) no longer pass the Host's compressor into the Guest.
Initialization failures terminate the session through [SandboxSessionEndpoint](./session.ts).
Future compressor updates must arrive before any retained or new commit that depends on them.

### 2. Send Guest ID progress with changes

After `getChange()` finishes encoding a Guest edit, capture a non-disposing shard synchronization token.
Include the token with the existing `guestChange` fields in one Guest-to-Host message.
Validate the message and token before mutating either compressor or tree state.
The Host calls `synchronizeWithShard(token)` before `local.applyChange(message.change)`, binding handles, merging, or sending `guestChangeAck`.
Token ownership is checked by the parent compressor; protocol validation must also constrain token shape and progress to prevent invalid or excessive work.
Preserve the existing change IDs, acknowledged `mainRevision` and `trunkRevision` checks, commit metadata, message directions, and error-handling rules.

### 3. Send Host ID progress to the live Guest

Add an incremental parent-to-child synchronization mechanism to the ID-compressor library, or establish an equivalent supported internal API **before** declaring the sandbox change complete.
It must make Host-known local IDs and ordered finalized creation ranges available to an existing child without replacing its compressor, changing its allocation stride, or permitting collisions.
Determine how the Host observes finalized ranges from the runtime; access through test-only provider state is not sufficient for a real Host.

Carry the required compressor updates over the Host-to-Guest channel ahead of each `hostUpdate` that depends on them, including updates that only advance the finalized-history boundary.
Apply them before the Guest replays any serialized commit or interprets a revision that depends on them.
Specify ordering and replay behavior for delayed updates, concurrent edits, remote-client ranges, retained initialization commits, and session replacement.
Preserve the Host-branch copy and Guest-side rebase; do not generate corrective net changes as a workaround.
Do not call `takeNextCreationRange()` merely to construct a sandbox update: range submission and finalization belong to the runtime.

This step requires an API-design investigation.
An early test should create a child shard, mint an ID on the Host after sharding, and apply a Host-generated serialized change to the Guest without first advancing the Guest.
Repeat with an ID from a peer whose creation range is finalized after sharding.
Also test a retained Host commit that is replayed during initialization.
Use the failures to specify the smallest safe parent-to-child compressor API.

### 4. Close and recreate sessions safely

On orderly Guest shutdown, stop sending edits, dispose both its hidden Host branch and its authoring view, and call `disposeShard()` only when no retained Guest reference can generate more IDs.
Send the disposal token after outstanding Guest changes.
Once the Host has processed those changes, it synchronizes the disposal token and can reclaim the shard's ID space.
An orderly close may need an asynchronous handshake: the current synchronous `Guest.dispose()` closes the port, so it cannot by itself send and confirm a final token.
Define a close acknowledgment if the application needs confirmation that reclamation completed.

On transport loss or uncertain Guest termination, do **not** reclaim its shard while it might still generate IDs.
Report the failure and use application-level termination or fencing before reclamation.
Document and bound the cost of unreclaimed sessions: repeated sharding increases the allocation stride and has a limit.
Keep the existing rule that disposing the Host does not dispose the application's main view.

## Completion criterion

The work is complete only when both edit directions work across separate JavaScript realms **without** sharing a compressor instance, and the complete initialization payload crosses the port.
Passing only the initial-tree test does not meet this criterion.
