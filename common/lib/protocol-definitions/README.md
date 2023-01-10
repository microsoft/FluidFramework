# @fluidframework/protocol-definitions
 Core set of Fluid protocol interfaces shared between services and clients.
These interfaces should always be back and forward compatible.

**Topics covered below:**

- [NoOps](#NoOps)


## NoOps
Definition: NoOps have `MessageType.NoOp`. "Empty operation message. Used to send an updated reference sequence number. Relay service is free to coalesce these messages or fully drop them, if another op was used to update Minimum Sequence Number to a number equal to or higher than referencedsequence number in Noop."

At the end of a batch of ops, the client will send an NoOp to let the server know it's the end of the batch, almost like a benchmark? Sometimes we can also send noOp immediately, see both in CollabWindowTracker.scheduleSequenceNumberUpdate()

Expectations: noops can be coalesced by service, which means:
1. noop can be dropped by service. In such case, we observe a gap in clientSequenceNumber (otherwise all ops for a given clientId have sequential clientSequenceNumber values).
2. noop can be delayed by service (sequences later in time) and be reordered relative to ops that naturally follow it. That said, reordering can only happen across ops from different clients (if more ops are sent and sequenced by given client, then noop is simply dropped in such case).



See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
