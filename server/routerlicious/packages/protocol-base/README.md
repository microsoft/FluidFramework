# @fluidframework/protocol-base

Shared protocol code for client and service to share. Manages the lifetime of Quorum and proposals that needs to be
consistent across client and service. It also provides utilities for facilitating summary creation.

## Quorum and Proposal

A quorum proposal transitions between two states: propose and accept.

A proposal begins in the propose state. The proposal is sent to the server and receives a sequence number which is
used to uniquely identify it. Clients within the collaboration window accept the proposal by allowing their
reference sequence number to go above the sequence number for the proposal. Once the minimum sequence number
goes above the sequence number for the proposal without it is considered accepted.
