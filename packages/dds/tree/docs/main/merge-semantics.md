# SharedTree Merge Semantics

This document offers a high-level description `SharedTree`'s merge semantics.

Target audience: `SharedTree` users and maintainers.

## What Are Merge Semantics?

Merge semantics define how `SharedTree` reconciles concurrent edits.

### Concurrent Edits

When several peers edit the same document, it's possible for some of the edits to be concurrent.
The edits of two clients are concurrent if they each made those edits before they had received the others’ edits from the server.

For example, imagine Alice and Bob are editing a document that contains stick notes whose background color can be changed.
If Alice changes the background color of one sticky note from yellow to red,
that edit will be sent to the server which will forward it to Bob.

Now imagine Bob wants to change the background of that same sticky note to the color blue.
If Bob makes this change _after_ receiving the edit from Alice, then he will be changing the color from red to blue.
This is not a case of concurrent editing because Bob had received Alice's edit before changing the color.

On the other hand, if Bob makes this change _before_ receiving the edit from Alice,
then his edit will be concurrent to Alice's edit, and he will be changing the color from yellow to blue.

### Reconciling Concurrent Edits

Reconciling concurrent edits is trivial when they affect independent parts of the tree.

For example, if Alice and Bob concurrently change the background color of _separate_ sticky notes,
then there is only one reasonable outcome.

However, it's possible for some concurrent edits to affect overlapping parts of the tree.
This leads to a situation where there may be multiple reasonable outcomes
(and possibly some unreasonable ones).

For example, if Alice and Bob concurrently change the background color of _the same_ sticky note
such that Alice would change it from yellow to red and Bob would change it from yellow to blue,
then there are multiple reasonable outcomes:

-   change the color to red
-   change the color to blue
-   keep the color yellow

`SharedTree`'s merge semantics define which outcome will be picked.

## Why/When Should You Care?

`SharedTree`'s merge semantics have been designed so that concurrent edits,
even when they target overlapping data,
are merged in a way that is typically satisfactory and unsurprising.
This means that, on a daily basis, users of `SharedTree` should be able ignore the question of merge semantics.

There are however situations that warrant an awareness and understanding of merge semantics.
Those are commonly:

-   The need to understand the end-user experience that users will face in a given scenario that involves concurrent editing.
-   The need to select a data model (i.e., how a document is structured) for an application so that the application's invariants are upheld by `SharedTree`'s merge semantics.
-   The need to structure the application's editing code such that it can guarantee that the application's invariants are upheld by `SharedTree`'s merge semantics.

For example, consider an the application whose data model includes two arrays,
with the invariant that the length of one array is expected always be the same as the length of the other array.
The application's editing code may attempt to keep the two arrays' length in sync by always adding to and removing from both array in equal measure.
Despite that, `SharedTree`'s merge semantics are such that a scenario involving concurrent edits may still lead to a state where the arrays end up with different length.
Understanding `SharedTree`'s merge semantics can help the application author anticipate this invariant violation or (failing that) diagnose it after the fact.
Understanding `SharedTree`'s merge semantics will also enable the application author to understand how to remedy this danger,
either by adopting a data model that prevents the issue (e.g., using a single array of pair),
or by changing the application's editing code (transactions and constraints) to circumvent it.
