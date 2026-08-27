# Sandbox Demo

The test file in this folder includes an example architecture that could be used to support running a SharedTree view in a sandbox.

This example provides the following:
* A protocol for messages sent between the host and the sandbox
* A sample implementation of the host and sandbox that support the protocol
* Tests that demonstrate usage patterns and validate the implementation

The key value of such an architecture is to expose the familiar (and feature-rich) SharedTree view in a sandbox,
thus alleviating the need for custom protocols and custom conflict resolution.

## Terminology

Similar to that used around virtual machines, we can refer to the two sides as "Host" and "Guest".

- Host: the SharedTree actually connected to fluid services.
- Guest: the TreeView and its related internals which are separated from the Host my a message protocol, and does not require any shared state.

- Host-local edits: local to the host (not sequenced yet).
- Guest-local edits: local to the guest (not acknowledged by the host yet).
- Host originated edits: edits made by the host directly, not from a guest.

Add additional terminology decisions to this section as appropriate.

Most current docs refer to "guest" as "sandbox": prefer "guest" since this protocol can be used even when no security boundary is needed.

Update documentation and code to match choices in this section.

## Key Assumptions

1. All messages between the host and the sandbox are expected to eventually arrive.
2. All messages flowing in a given direction (either from the host to the sandbox or the reverse)
are expected to arrive in the order they were sent.
There is no assumption about the relative order of arrival of messages going in opposite directions.
3. The tree code on both sides is the same exact version, so no stabilization of this protocol is required.
4. All messages, including initialization, are compatible with [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort) (This is not yet true for the example, see "ID Sharding" and "Fluid Handles" below).

## Path to Production

These items can be done in any order.

If the testing work is done before implementation, some of the tests will fail, but that doesn't need to block writing them.

### ID Sharding

The same id-compressor instance is currently used in the host and the sandbox.
This is not feasible in practice as the host and sandbox should be running on different processes.
The code should be updated to serialize a sharded id-compressor.

Sharding support was added in https://github.com/microsoft/FluidFramework/pull/26294.
That support was reverted in https://github.com/microsoft/FluidFramework/pull/26394.
This work will need to be fixed, restored, and used, or some alternative found.

### Fluid Handles

SharedTree content can contain `IFluidHandle` values, which cannot be passed directly across a process or iframe boundary.
Messages crossing the boundary should be processed by a custom `IFluidSerializer` that replaces handles with opaque, serializable tokens.
Within the sandbox, a specialized `IFluidSerializer` should decode these tokens into custom handles whose asynchronous `get()` method requests the referenced content from the host using the token.

For the initial use case, the host only needs to support blob handles.
Other handles can error when `get` is called and the result from the handle is not a blob.

To ensure the sandbox cannot request any blobs it should not have access to, the tokens used should not be the handle URLs, but instead values which only have meaning to the host and its ability to map them back to the URL.
Thus the tokens can be simple numbers, allocated sequentially, which correspond indexes in an array of handles the cached on the host side used to implement the blob lookup.

When sandbox changes are sent to the host, the sandbox serializer should convert the handles back to their tokens,
and the host should restore and bind the real handles before applying the changes.

The production implementation should preserve handle identity for repeated references (it can cache them in an array) and propagate resolution errors.
It should cache fetched blobs in their handles to save sandbox traversal for repeated lookups.
Deduplication of concurrent lookups (to prevent sending the same data into the sandbox more than once) would be good, but not strictly required (note if not done as possible improvement).

Review features of [MessagePort](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort) when picking how to transfer the data (likely having it copy an ArrayBuffer is simplest, but there are other options that can avoid a copy if the host already has a copy of the data can could instead transfer it).

### Host lifetime extensions

The rebaser automatically lifetime extends (aka retains in memory) information needed to support
existing revertibles and local branches.

For this sandbox setup, the host needs to ensure it keeps around anything it might need to support the guest: data refreshers for supporting revertibles which un-delete content are of particular note,
but local branches should also be considered.

If a unified branch based solution can be implemented (which leverages that revertibles lifetime extend branches), that should be preferred as it is more general. Perhaps the host can defer deleting branches until it confirms the guest no longer has them, or the host side of the connection can retain extra references which are a conservative superset of what the guest could have (pruned async with confirmations).

### Trunk Trimming for Guest

Not a hard requirement of V1 as supporting timeline will opt out of this trimming anyway,
but in generally we should ensure the guest doesn't leak unbounded history unless its specifically configured to retain it.

### `MessagePort` and IFrame Testing

The current tests pass messages by reference and therefore do not validate the actual cross-realm serialization boundary.
Production tests should send all messages through a real `MessagePort`,
and should include an integration test using an isolated iframe (to ensure we don't accidentally depend on shared globals).

### Edge Case Unit Testing

The tests should cover concurrent host and sandbox edits, delayed and interleaved messages,
sandbox reloads or disposal with messages in flight, malformed messages, and incompatible protocol versions.

Handle-specific tests should cover repeated references, concurrent `get()` calls, resolution failures.

Validate undo/redo, including undo of deletes after host would have discarded its data refreshers.

### Timeline

We need to ensure that the timeline related APIs, like `TreeView.branchHistory` work in the guest.

Moving to the "Full-Duplex Architecture" (Below) is a dependency for this working correctly (matching the timeline on the host),
but there are some additional details to implement and/or validate:
- ensure timeline works correctly for changes which are still local to the guest.
- bootstrap in such a way that guest can get all of host's history, so timeline can include changes from before the guest was created. This could use a snapshot/summary of the host, though this may need to include local edits, so opt-ins to allow that, or other approaches may be needed (like serializing the revision manager directly instead of using the SharedTree level snapshot).
- If using our codecs for the protocol, ensure we use sufficiently new versions (likely just set min version for collab to the current version) to ensure persisted metadata on commits works.

### Full-Duplex Architecture (Required to be compatible with timeline)

The current architecture has the merit of being replicable by application authors using their own protocols.
This is because it does not require merge resolution capabilities within the sandbox.
However, the current architecture relies on delaying updates to the sandbox as long as the sandbox has local changes.
While this means the sandbox may experience delayed updates,
and a very active sandbox editor could force the system toward more and more expensive rebase operations locally.

The following alternative should be considered:
* Maintain a copy of the trunk (sequenced), main (host's local), and local sandbox branches on the sandbox.
* Instead of performing merge resolution on behalf of the sandbox,
  the host would just notify the sandbox of new commits on the trunk and main branches.
  The sandbox would then be able to rebase its local branches accordingly.
* When sending edits from the sandbox to the host,
  include the revisions of the latest commits on main and trunk branches at the time the edits were authored.
  The host can use this information to update its own branches accordingly.

This is basically a simple variant of the edit manager which does a similar job for the host but accounting for the branches of every remote client, not just a single one.

### Fix Memory Leak in Exhaustive Test (optional)

See the comment on the "All permutations" test.
