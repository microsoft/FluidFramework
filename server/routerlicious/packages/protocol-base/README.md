# @fluidframework/protocol-base

The loader makes up the minimal kernal of the Fluid runtime. This kernel is responsible for providing access to
Fluid storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on document properties. One
example of this is the npm package that should be loaded to process operations applied to the document.

## Document and channels

The base document channel is 'owned' and run by the chaincode of the loader. It should be versioned and require
a specific loader version.

The channels of the document run separate code as defined by the consensus field. It's possible we could further
split this and have each channel have an independent code source and use the consensus to propagate it.

We could also possibly define a runtime code that gets executed independent of a chain - this would be for UI,
etc...

## Proposal lifetime

A quorum proposal transitions between four possible states: propose, accept, reject, and commit.

A proposal begins in the propose state. The proposal is sent to the server and receives a sequence number which is
used to uniquely identify it. Clients within the collaboration window accept the proposal by allowing their
reference sequence number to go above the sequence number for the proposal. They reject it by submitting a reject
message prior to sending a reference sequence number above the proposal number. Once the minimum sequence number
goes above the sequence number for the proposal without any rejections it is conisdered accepted.

The proposal enters the commit state when the minimum sequence number goes above the sequence number at which it
became accepted. In the commit state all subsequent messages are guaranteed to have been sent with knowledge of
the proposal. Between the accept and commit state there may be messages with reference sequence numbers prior to
the proposal being accepted.