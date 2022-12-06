# Undo

This document offers a high-level description of the undo system.
It should be updated once more progress is made on the implementation.

## Abstract vs. Concrete Undo Messages

Conceptually, an undo edit starts as a very abstract and succinct intention:
"Undo changes from prior change _\<revision-tag\>_".
It ultimately needs to be converted into a more concrete and verbose description of what changes the undo entails
(e.g., "delete the node at this path").
This concrete form is the one that the application code (commonly the Forest code) is able to process.

One key design question is:
what form should the undo edit be in when it is sent by the issuing client to the sequencing service?
We can think of this as asking which part of the concretization process should happen on the client that is issuing the undo (i.e., pre broadcast),
and which part should happen on peers upon receiving the undo (i.e, post broadcast).

This choice is subject to many tradeoffs:

-   Access to historical data (original change, [repair data](../repair-data/README.md), [interim changes](#interim-change))
    -   Pre-broadcast computation puts the burden of providing historical data on the issuing client.
    -   Post-broadcast computation puts the burden of providing historical data on all peers
        (which means that this data must be included in summaries).
-   Access to sequencing information for the undone edit
    -   Pre-broadcast computation may occur before the undone edit is sequenced.
    -   Post-broadcast computation will occur after the undone edit is sequenced.
-   Access to sequencing information for the undo edit
    -   Pre-broadcast computation will occur before the undo edit is sequenced.
    -   Post-broadcast computation will occur after the undo edit is sequenced.
-   Computational load
    -   Pre-broadcast computation only consumes computational resources on the issuing client.
    -   Post-broadcast computation consumes computational resources on all peers.

Note that larger summary sizes and larger message sizes both increase the network/server load and make (down)loading documents slower.

Because the above choice has such a performance impact,
we give applications some agency in choosing the tradeoff that works for them.
We accomplish that by introducing the concept of an "undo window".

## The Undo Window

The undo window defines how far back, in terms of the edit history,
peers are expected to retain information about past edits and their associated repair data.

For this data to be retained, it must first be obtained.
This happens in two ways:

-   When a peer joins a session, the relevant historical information is included in the summary.\*
-   When a peer receives a new edit from the sequencing service,
    it computes the corresponding repair data and stores it alongside the edit.

\* Technically, the historical data needed for undo could be loaded separately in an effort to reduce startup time.

As older edits fall outside of the undo window, the edit information, including its repair data,
can be deleted from the peer's memory.

When issuing an undo,
a client will therefore proceed differently depending on whether the change to be undone lies within the undo window or not.

## Undo Edits Within The Undo Window

Note that this includes cases where the client issuing the undo is also the issuer of the change to be undone,
and that client has yet to receive the change to be undone back from the sequencing service.
This can happen when a client wants to issue an undo very soon after issuing the change to be undone.
It can also happen whenever a client has been offline for some period of time.

Issuing an undo for a change that falls within the undo window can be done by sending an edit that indicates the `RevisionTag` of the edit to be undone.
Such an undo edit is not a changeset.
The receiving peers will construct a changeset based on it, and apply that changeset to their tip trunk state.

Note that the issuer of an undo may attempt to undo a change that is within the undo window,
send the adequate undo message,
and find out that by the time the undo message was sequenced,
the edit to be undone had fallen out of the undo window.
In such circumstances, the undo fails (all peers ignore it).
The issuer of the undo can either give up on undoing the change,
or try again in the new context (i.e., undoing an edit outside the undo window).

## Undo Edits Outside The Undo Window

In a low-frequency (i.e. non-live) collaboration environment,
the edit to be undone will commonly lie outside of the undo window.

There are several approaches we could consider:

1. Do the same when the edit to undo is within the undo window but send along the relevant historical data.
2. Compute the net change to the tip state
   (possibly by re-running commands)
   and send that as a normal changeset.
   Such a changeset would be rebased over any concurrent edits.
3. Same as #2 but with instruction for the changeset to be handled differently
   (e.g., by [postbasing](#postbase) it over concurrent edits instead of rebasing it).

## Partial Undo

Longer term, we may support a more localized undo that only reverts changes within a specific region of the document.
This could be achieved by including in the undo message a characterization of the region of the document to be affected by the undo.
This may need to be characterized as a combination of input context regions and output context regions.

## Glossary

### Interim Change

A change that is sequenced after the change to be undone, but before the undo change.
Interim changes may depend on the change being undone.

### Postbase

A variant of rebase.
Postbasing change `a` over change `b`,
where `a` applies to state `s` and produces state `sa`
and `b` applies to state `s` and produces state `sb`,
produces a change `a'` that applies to state `sb` and produces the state `sab`,
which is the same state one would get by applying `rebase(b, a)` to `sa`.
