# Sandbox Demo

The test file in this folder contains an example architecture for a SharedTree view in a sandbox.

The example contains these items:

* A protocol for messages between the Host and the Guest.
* An example implementation of the Host and the Guest.
* Tests that show usage patterns and validate the implementation.

This architecture gives applications access to the familiar, feature-rich SharedTree view inside a sandbox.
Application developers can use its existing APIs and conflict resolution instead of building custom alternatives.

## Terminology

Use the terms "Host" and "Guest" for the two sides.
These terms are similar to the terms for virtual machines.

- **Host**: The SharedTree that connects to Fluid services.
- **Guest**: The TreeView and its related internal components. A message protocol separates the Guest from the Host. The Guest does not share state with the Host.

- Host-local edits: Edits on the Host that are not sequenced.
- Guest-local edits: Edits on the Guest that the Host has not acknowledged.
- Host-originated edits: Edits that the Host makes directly. These edits do not come from a Guest.

Add new terminology decisions to this section when necessary.

## Key Assumptions

1. Each message between the Host and the Guest eventually arrives.
2. Messages that move in the same direction arrive in the order that they were sent.
    This requirement applies in each direction.
    Messages that move in opposite directions can arrive in any relative order.
3. The Host and the Guest use the same version of the tree code.
    Thus, this protocol does not require version stabilization.
4. Each message is compatible with [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort).
    This requirement includes initialization messages.
    The example does not currently meet this requirement.
    For more information, see "ID Sharding" and "Fluid Handles."

## Path to Production

Complete these items in any order.

Some tests will fail if you write them before you complete the implementation.
These failures do not prevent you from writing the tests.

### ID Sharding

The Host and the Guest currently use the same id-compressor instance.
This design is not practical because the Host and the Guest can run in different processes.
Update the code to serialize a sharded id-compressor.

Sharding support was added in https://github.com/microsoft/FluidFramework/pull/26294.
The change was reverted in https://github.com/microsoft/FluidFramework/pull/26394.
Fix, restore, and use that implementation, or implement a different solution.

### Fluid Handles

SharedTree content can contain `IFluidHandle` values.
You cannot send these values directly across a process or iframe boundary.
Use a custom `IFluidSerializer` to process messages that cross the boundary.
The serializer replaces each handle with an opaque token that it can serialize.
In the Guest, a specialized `IFluidSerializer` converts each token to a custom `IFluidHandle` implementation.
The asynchronous `get()` method of the custom handle sends the token to the Host and requests the referenced content.

For the initial use case, the Host only needs to support blob handles.
For all other handle types, `get()` can return an error if the result is not a blob.

Do not use the Host handle URLs as tokens.
This rule prevents the Guest from requesting blobs that it must not access.
The Host can allocate sequential numbers as tokens and store the permitted blob handles in a Guest-session-scoped array.
Each token is an index into this array and has meaning only to the Host.
For each request, the Host should validate the index, resolve the corresponding handle, and transfer the blob data to the Guest.

When the Guest sends changes to the Host, the Guest serializer converts each custom handle back to its token.
Before the Host applies the changes, it restores and binds the real handles.

The production implementation should preserve custom handle identity for repeated references and propagate resolution errors.
It should cache a single promise for blobs in their custom handles.
The cache deduplicates requests to prevent optimize data transfers to the Guest.
The promise is cached so that the deduplication handles concurrent requests.

Review the [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort) features before you select a data-transfer method.
The simplest method is probably to copy an `ArrayBuffer`.

### Host Lifetime Extensions

How the Host manages the lifetime of some data must be adjusted.
The Host revision manager must retain additional branches to support the Guest.

A branch-based solution should be able to address the Guest's use of revertables as well as local branches.
Prevent the Host from pruning any branches that the Guest could know about until confirming the Guest no longer retains them.

### Trunk Trimming for Guest (Not required for V1)

Keep an unlimited history only when the Guest is configured to do so.
Guest Trunk trimming is not a requirement for V1 because timeline support disables this trimming.
In other configurations, make sure that the Guest does not keep an unlimited history.


### `MessagePort` and IFrame Testing

The Host and the Guest send runtime data changes and acknowledgments through a real `MessagePort`.
The unit tests validate the structured-clone boundary.
The permutation test uses a two-channel relay to control message delivery in each direction.

Initialization data does not yet pass through the port.
Complete the ID sharding and Fluid handle work before initialization uses the message protocol.

Add an integration test that uses an isolated iframe.
This test makes sure that the implementation does not depend on shared global values.

### Edge Case Unit Testing

The tests should cover concurrent Host and Guest edits, delayed and interleaved messages,
Guest reloads or disposal with messages in flight, and malformed messages.
Handle-specific tests should cover repeated references, concurrent `get()` calls, resolution failures.

Validate undo and redo operations.
Include an operation that reverses a deletion after the Host would have normally discarded its data refreshers.

### Timeline

Make sure that timeline APIs such as `TreeView.branchHistory` operate in the Guest.

The Guest timeline must match the Host timeline.
The current architecture adds corrective changes instead of editing history, which makes the timeline incorrect.
The "Full-Duplex Architecture" is necessary for the correct behavior.
Also complete these tasks:

- Make sure that the timeline operates correctly for changes that are still local to the Guest.
- Give the Guest all Host history during initialization. The timeline must include changes from before the Guest was created.
    - Consider a Host snapshot or summary for this initialization. The snapshot or summary might have to include local edits. If it includes local edits, add an option that permits this behavior.
    - Consider serializing the revision manager directly instead of using a SharedTree snapshot.
    - Validate when Host has local changes.
- Make sure that history operations on a local branch do not cause incorrect behavior.
- If the protocol uses our codecs, use versions that preserve commit metadata. One possible solution is to set the minimum collaboration version to the current version.

### Full-Duplex Architecture (Required for Timeline Compatibility)

Application developers can reproduce the current architecture with their own protocols.
The architecture does not require merge resolution in the Guest.
However, it delays updates to the Guest while the Guest has local changes.
As a result, the Guest can receive updates late.
A very active Guest editor can also cause increasingly expensive local rebase operations.

Consider this alternative architecture:

* On the Guest, keep a copy of the sequenced trunk branch, the local Host main branch, and the local Guest branches.
* Do not perform merge resolution for the Guest on the Host. Instead, the Host notifies the Guest of new commits on the trunk and main branches. The Guest then rebases its local branches.
* When the Guest sends edits to the Host, include the revisions of the latest commits on the main and trunk branches. Use the revisions that were current when the Guest created the edits. The Host uses this information to update its branches.

This design is a simple variant of the edit manager.
The edit manager does a similar task for the Host, but it manages the branches of all remote clients instead of one Guest.

### Fix Memory Leak in Exhaustive Test (optional)

See the comment on the "All permutations" test.
