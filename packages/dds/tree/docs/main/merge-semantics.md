# SharedTree Merge Semantics

This document offers a high-level description `SharedTree`'s merge semantics.

Target audience: `SharedTree` users and maintainers.

## What Are Merge Semantics?

Merge semantics define how `SharedTree` reconciles concurrent edits that affect the same (or related) parts of the shared document.

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

`SharedTree`'s built in merge semantics define which outcome will be picked.

## Why/When Should You Care?
