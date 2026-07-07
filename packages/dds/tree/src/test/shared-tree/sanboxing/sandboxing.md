# Sandbox Demo

The test file in this folder includes an example architecture that could be used to support running a SharedTree view in a sandbox.

This example provides the following:
* A protocol for messages sent between the host and the sandbox
* An sample implementation of the host and sandbox that support the protocol
* Tests that demonstrate usage patterns and validate the implementation

The key value of such an architecture is to expose the familiar (and feature-rich) SharedTree view on a sandbox,
thus alleviating the need for custom protocols and custom conflict resolution.

## Key Assumptions

1. All messages between the host to the sandbox are expected to eventually arrive.
2. All messages flowing in a given direction (either from the host to the sandbox or the reverse)
are expected to arrive in the order they were sent.
There is no assumption about the relative order of arrival of messages going in different directions.

## Path to Production

### ID Sharding

The same id-compressor instance is currently used in the host and the sandbox.
This is not feasible in practice as the host and sandbox should be running on different processes.
The code should be updated to serialize a sharded id-compressor.
(See https://github.com/microsoft/FluidFramework/pull/26294).

### Terser Update Format (optional)

The implementation currently uses a `JsonCompatibleReadOnly` encoding of a SharedTree change for sending an update from the host to the sandbox.
This contains more data than strictly necessary since such a change includes all metadata necessary to rebase changes.
A more efficient implementation may be able use a `Delta` instead.
Caution: this might cause issues with event notifications on the sandbox view.

### Fix Memory Leak in Exhaustive Test (optional)

See the comment on the "All permutations" test.