# @fluidframework/protocol-base

## Purpose
The purpose of @fluidframework/protocol-base is to manage the lifetime of Quorum and proposals that needs to be consistent across client and service and blob implementation. It was intially part of the server release group but now has been moved to the client release group. 

## Quorum and Proposal

A quorum proposal transitions between two states: propose and accept.

A proposal begins in the propose state. The proposal is sent to the server and receives a sequence number which is
used to uniquely identify it. Clients within the collaboration window accept the proposal by allowing their
reference sequence number to go above the sequence number for the proposal. Once the minimum sequence number
goes above the sequence number for the proposal without it is considered accepted.
