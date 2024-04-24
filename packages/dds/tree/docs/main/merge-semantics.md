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

## A Holistic View

`SharedTree` allows developers to describe the data model for their application in terms of a set of elementary building blocks,
like objects nodes, map nodes, and array nodes.
Each of these building blocks comes with its own editing API and associated merge semantics,
so fully understanding the merge semantics of `SharedTree` entails understanding the individual merge semantics of each of these building blocks.
That said, those merge semantics are in large part underpinned by a set design choices that apply to `SharedTree` as a whole.
Understanding those design choices and their ramifications is the most crucial part of understanding `SharedTree`'s merge semantics,
and often alleviates the need to remember the details of any building blocks's specific merge semantics.

### Movement Is Not Copy

`SharedTree` allows subtrees to be moved from one location to another,
and such movement does not adversely affect concurrent edits that target the moved subtree.
This is different from inserting a new copy of the moved subtree at the destination
(and deleting the original at the source).

Consider following scenario:
Alice moves a sticky note from one list to another,
while Bob concurrently edits the text of the note.
If the move were just a copy, then if Alice's edit were to be sequenced first,
Bob's edit would not apply to the copy at the destination.
By contrast, `SharedTree`'s move semantics ensure that Bob's edit will apply no matter the sequencing order.

### Removal as Movement

`SharedTree` allows subtrees to be removed,
such as when an element from an array node is removed,
a key is deleted from a map node,
or when the field on an object is overwritten.
This removal does not adversely affect concurrent edits that target the removed subtree.

Consider following scenario:
Alice removes a whole list of sticky notes, while Bob concurrently moves a sticky note out of that list and into another (non-removed) list.
`SharedTree`'s removal semantics ensure that Bob's edit will apply no matter the sequencing order.
If that weren't the case, then there would be a race between Alice and Bob's edit,
where Bob's edit would not apply if Alice's edit were sequenced first.

Note that in a lot of cases, the changes to the removed subtree won't be immediately visible because the tree is removed.
They will however become visible if that removal is undone.

These merge semantics effectively make removal akin to a move whose destination is an abstract "removed" location.

### Last Write Wins

It's possible for concurrent edits represent fundamentally incompatible user intentions.
Whenever that happens, the edit that is sequenced last will win out.

Example 1:
Alice and Bob concurrently change the background color of the same sticky note
such that Alice would change it from yellow to red and Bob would change it from yellow to blue.
If the edits are sequenced such that Alice's edit is applied first and Bob's edit is applied second,
then the background color of the note will change from yellow to red then from red to blue.
If the edits are sequenced in the reverse order,
then the background color of the note will change from yellow to blue then from blue to red.

Example 2:
Alice and Bob concurrently move the same sticky note
such that Alice would move it from location X to location A and Bob would move it from location X to location B.
If the edits are sequenced such that Alice's edit is applied first and Bob's edit is applied second,
then the note will first be moved from X to A then from A to B.
If the edits are sequenced in the reverse order,
then the note will first be moved from X to B then from B to A.

### Putting It all Together

### Constraints

### Schema Changes
