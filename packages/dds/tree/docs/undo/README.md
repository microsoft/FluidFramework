# Undo

This document offers a high-level description of the undo system.

## Abstract Undo Messages

Conceptually, an undo edit starts as a very abstract and succinct intention:
"undo changes from prior change _\<revision-tag\>_".
It ultimately needs to be converted into a more concrete and verbose description of what changes the undo entails
(e.g., "delete the node at this path").
This concrete form is the one that the application code (commonly the Forest code) is able to process.

One key design question is:
what form should the undo edit be in when it is sent by the issuing client to the sequencing service?
We can think of this as asking which part of the concretization process we want to happen on the client that is issuing the undo,
and which part we want to happen on every peer receiving the undo.

This choice is subject to many asymmetries:

-   Access to historical data
    -   Computation that is done before sending puts the burden of providing repair data solely on the issuing client.
    -   Computation that is done after receiving puts the burden of providing repair data on all peers.
-   Access to sequencing information for the undone edit
    -   ... before sending may occur before the undone edit is sequenced.
    -   ... after receiving will occur after the undone edit is sequenced.
-   Access to sequencing information for the undo edit
    -   ... before sending may occur before the undo edit is sequenced.
    -   ... after receiving will occur after the undo edit is sequenced.
-   Computational load
    -   ... before sending only consumes computational resources on the issuing client.
    -   ... after receiving consumes computational resources on all peers.

Additionally, the more abstract the undo message, the smaller it will tend to be,
which reduces the network and service loads.

We opt to make the undo message sent over the wire as abstract as possible.
