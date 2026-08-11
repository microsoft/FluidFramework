# @fluidframework/protocol-definitions

Core set of Fluid protocol interfaces shared between services and clients.
These interfaces should always be back and forward compatible.

**Topics covered below:**

-   [NoOps](#NoOps)

## NoOps

Definition: NoOps are empty operation message, with the type of `MessageType.NoOp`. They are used to send an updated referenceSequenceNumber to service. Relay service is free to coalesce these messages, or fully drop them if another op was used to update Minimum Sequence Number, to a number equal to or higher than the referenceSequenceNumber in Noop. Client will send NoOps periodically, see `NoopHeuristic`.

Expectations: NoOps can be coalesced by service, which means:

1. NoOp can be dropped by service. In such case, we observe a gap in clientSequenceNumber (otherwise all ops for a given clientId have sequential clientSequenceNumber values).
2. NoOp can be delayed by service (sequenced later in time) and be reordered relative to ops that naturally follow it. That said, reordering can only happen across ops from different clients (if more ops are sent and sequenced by given client, then noop is simply dropped in such case).

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
