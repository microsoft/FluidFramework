# Sandbox Demo

The test file in this folder includes an example architecture that could be used to support running a SharedTree view in a sandbox.

This example provides the following:
* A protocol for messages sent between the host and the sandbox
* A sample implementation of the host and sandbox that support the protocol
* Tests that demonstrate usage patterns and validate the implementation

The key value of such an architecture is to expose the familiar (and feature-rich) SharedTree view on a sandbox,
thus alleviating the need for custom protocols and custom conflict resolution.

## Key Assumptions

1. All messages between the host and the sandbox are expected to eventually arrive.
2. All messages flowing in a given direction (either from the host to the sandbox or the reverse)
are expected to arrive in the order they were sent.
There is no assumption about the relative order of arrival of messages going in opposite directions.

## Path to Production

### ID Sharding

The same id-compressor instance is currently used in the host and the sandbox.
This is not feasible in practice as the host and sandbox should be running on different processes.
The code should be updated to serialize a sharded id-compressor.
(See https://github.com/microsoft/FluidFramework/pull/26294).

### Full-Duplex Architecture (optional)

The current architecture has the merit of being replicable by application authors using their own protocols.
This is because it does not require merge resolution capabilities within the sandbox.
However, the current architecture relies on delaying updates to the sandbox as long as the sandbox has local changes.
While this means the sandbox may experience delayed updates,
and a very active sandbox editor could force the system toward more and more expensive rebase operations locally.

The following alternative should be considered:
* Maintain a copy of the trunk, main, and local sandbox branches on the sandbox.
* Instead of performing merge resolution on behalf of the sandbox,
  the host would just notify the sandbox of new commits on the trunk and main branches.
  The sandbox would then be able to rebase its local branches accordingly.
* When sending edits from the sandbox to the host,
  include the revisions of the latest commits on main and trunk branches at the time the edits were authored.
  The host can use this information to update its own branches accordingly.

### Fix Memory Leak in Exhaustive Test (optional)

See the comment on the "All permutations" test.