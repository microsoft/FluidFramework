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
This means that, on a daily basis, users of `SharedTree` should be able to ignore the question of merge semantics.

There are, however, situations that warrant an awareness and understanding of merge semantics.
Those are commonly:

-   The need to understand the end-user experience that users will face in a given scenario that involves concurrent editing.
-   The need to select a data model (i.e., how a document is structured) for an application so that the application's invariants are upheld by `SharedTree`'s merge semantics.
-   The need to structure the application's editing code such that it can guarantee that the application's invariants are upheld by `SharedTree`'s merge semantics.

For example, consider an application whose data model includes two arrays,
with the invariant that the length of one array is expected to always be the same as the length of the other array.
The application's editing code may attempt to keep the two arrays' length in sync by always adding to and removing from both array in equal measure.
Despite that, `SharedTree`'s merge semantics are such that a scenario involving concurrent edits may still lead to a state where the arrays end up with different length.
Understanding `SharedTree`'s merge semantics can help the application author anticipate this invariant violation or (failing that) diagnose it after the fact.
Understanding `SharedTree`'s merge semantics will also enable the application author to understand how to remedy this danger,
either by adopting a data model that prevents the issue (e.g., using a single array of pairs),
or by changing the application's editing code (transactions and constraints) to circumvent it.

## A Holistic View

`SharedTree` allows developers to describe the data model for their application in terms of a set of elementary building blocks,
like objects nodes, map nodes, and array nodes.
Each of these building blocks comes with its own editing API and associated merge semantics,
so fully understanding the merge semantics of `SharedTree` entails understanding the individual merge semantics of each of these building blocks.
That said, those merge semantics are in large part underpinned by a set of design choices that apply to `SharedTree` as a whole.
Understanding those design choices and their ramifications is the most crucial part of understanding `SharedTree`'s merge semantics,
and often alleviates the need to remember the details of any building blocks's specific merge semantics.

### Movement Is Not Copy

`SharedTree` allows subtrees to be moved from one location to another,
and such movement does not adversely affect concurrent edits that target the moved subtree.
This is different from inserting a new copy of the moved subtree at the destination
(and deleting the original at the source).

Consider the following scenario:
Alice moves a sticky note from one list to another,
while Bob concurrently edits the text of the note.
If the move were just a copy, then if Alice's edit were to be sequenced first,
Bob's edit would not apply to the copy at the destination.
By contrast, `SharedTree`'s move semantics ensure that Bob's edit will apply no matter the sequencing order.

### Removal Is Movement

`SharedTree` allows subtrees to be removed,
such as when an element from an array node is removed,
a key is deleted from a map node,
or when the field on an object is overwritten.
This removal does not adversely affect concurrent edits that target the removed subtree.

Consider the following scenario:
Alice removes a whole list of sticky notes, while Bob concurrently moves a sticky note out of that list and into another (non-removed) list.
`SharedTree`'s removal semantics ensure that Bob's edit will apply no matter the sequencing order.
If that weren't the case, then there would be a race between Alice and Bob's edit,
where Bob's edit would not apply if Alice's edit were sequenced first.

Note that in a lot of cases, the changes to the removed subtree won't be immediately visible because the tree is removed.
They will, however, become visible if that removal is undone.

These merge semantics effectively make removal akin to a move whose destination is an abstract "removed" location.

### Last Write Wins

It's possible for concurrent edits to represent fundamentally incompatible user intentions.
Whenever that happens, the edit that is sequenced last will win out.

Example 1:
Alice and Bob concurrently change the background color of the same sticky note
such that Alice would change it from yellow to red and Bob would change it from yellow to blue.
If the edits are sequenced such that Alice's edit is applied first and Bob's edit is applied second,
then the background color of the note will change from yellow to red then from red to blue.
If the edits are sequenced in the opposite order,
then the background color of the note will change from yellow to blue then from blue to red.

Example 2:
Alice and Bob concurrently moves the same sticky note
such that Alice would move it from location X to location A and Bob would move it from location X to location B.
If the edits are sequenced such that Alice's edit is applied first and Bob's edit is applied second,
then the note will first be moved from X to A then from A to B.
If the edits are sequenced in the opposite order,
then the note will first be moved from X to B then from B to A.

### Putting It All Together

Merge scenarios sometimes draw from multiple of the individual design choices presented above.

Here is an example that draws from all three:
Alice removes a sticky node, while Bob concurrently moves that same sticky note.
If the edits are sequenced such that Alice's edit is applied first and Bob's edit is applied second,
then the note will first be removed then moved to the destination defined by Bob's edit.
If the edits are sequenced in the opposite order,
then the note will first be moved to the destination defined by Bob's edit then removed.

More importantly, the high-level design choices presented above give rise to the following property:
by default\*, _no matter what concurrent edits may have been sequenced and applied before it_,
every edit is guaranteed to apply and guaranteed to impact the document state in one predictable way.

\* "By default" in this context means "in the absence of [constraints](#constraints)".

By "guaranteed to apply", we mean that the edit (and by extension, the transaction it is part of) is not dropped.
In the example above, Bob's edit to move the sticky note is not dropped when Alice's removal of that sticky note happens to be sequenced and applied first.

By "guaranteed to impact the document state in one predictable way",
we mean that the way the edit impacts the document is the same.
This point is a little more nuanced because it is predicated on a specific definition of "the same".
Each edit comes with such a definition.
For moves, what remains the same is the node being moved and the location that the node is moved to under the given parent node.
In the example above, Bob's edit to move the sticky note moves that specific sticky note to the specific destination picked by Bob under a specific parent node,
no matter whether concurrent edits were sequenced or applied before that and no matter what those concurrent edits were.
Concurrent edits could influence where the note was moved from, the properties of the note,
or even move or remove the parent (or some further ancestor) of the destination,
but none of that changes the fact that, immediately after Bob's edit is applied,
that specific sticky note will be located at the location chosen by Bob under a specific parent node.

This property is important because it makes reasoning about concurrent editing much more approachable.
This is most palpable in the context of transactions
because it reduces the number of possible states the document between could be in between the edits that make up the transaction,
therefore making transactions easier to author correctly,
and making the effect of a given transaction easier to understand.

For example, consider an application that allows the end user to select a set of sticky notes across several lists,
and group all of the selected notes under a new list, assigning to each one an ordinal number based on the selection order.
This functionality effectively allows a user to make a numbered list out of set of sticky nodes.

This can be achieved by writing a transaction that loops through the selected N notes in the order they were selected,
assigning ordinals incrementally and moving each one to the end of the new list.

By the time this transaction is sequenced and applied,
concurrent edits may have affected the relevant sticky notes in different ways:
some of them may have been assigned different ordinals,
some of them may have been moved, removed,
or their parent lists may have been moved or removed.
Despite that, `SharedTree`'s merge semantics guarantee that
by the end of the transaction all of the relevant sticky notes will reside in the new list,
and that their ordinals will be assigned in order from 1 to N.
If any of the concurrent changes had the power to prevent the relevant notes from being moved by our transaction,
or to prevent them from being annotated with the ordinals,
then our transaction may lead to a state where the new list only contains a subset of the selected notes,
and their ordinals may have gaps, not be unique, and be out of order.

More abstractly, for a transaction that is composed of `N` edits (`e1` through `eN`),
you can think of each edit `ei` as having one of `ki` possible effects,
where which of the `ki` possible effects is applied depends on what concurrent edits were sequenced before the transaction.
In aggregate, the effect of a transaction is therefore, in the worst case, one of `k0 * k1 * ... * kN` possible effects.
For a transaction that is composed of 10 edits where each edit has one of two possible effects,
that would mean the transaction would at worst have one of 1024 possible different effects.
`SharedTree`'s semantics guarantee that every `ki` is equal to 1,
meaning each transaction has only one possible effect.

## Constraints

The previous section established how `SharedTree`'s merge semantics guarantee that each transaction,
no matter how complex, and no matter what concurrent edits may have been sequenced before it,
has only one possible effect.
Constrains are a mechanism to allow transactions authors to override this default
so that their transaction will only have that effect if some specific conditions are met,
and will have no effect at all otherwise.
This is useful when the transaction's effect may be rendered undesirable by the effect of concurrent edits that are sequenced before the transaction.

Consider an application whose data model includes two arrays,
with the invariant that the length of one array is expected to always be the same as the length of the other array.
The application allows users to perform the following operations as transactions:

-   Add a new element in each array
-   Remove a single existing element from each array

There's no way for the adding of elements to violate the invariant that the lengths of the two arrays ought to remain the same.
It's possible however for the removal of existing elements to violate this invariant:
consider the starting state `{ arrayA: [1, 2], arrayB: [3, 4] }`.
Suppose Alice tries to remove element 1 from `arrayA` and element 3 from `arrayB`.
Concurrently to that, Bob tries to remove element 1 from `arrayA` and element 4 from `arrayB`.
No matter the sequencing order between Alice and Bob's transactions,
the resulting state once both are applied will be `{ arrayA: [2], arrayB: [] }`.

This issue can be addressed by adding a constraint to the transactions that remove elements:
each such transaction can establish a precondition that the nodes to be removed are not already removed.

With such a constraint, the resulting state in the scenario above will depend on the sequencing order:
It will be `{ arrayA: [2], arrayB: [4] }` if Alice's transaction was sequence before Bob's
and `{ arrayA: [2], arrayB: [3] }` otherwise.

### Schema Changes

At the time of writing,
all edits/transactions have the implicit constraint that the schema is not changed concurrently to them.
Similarly, all schema changes have the implicit constraint that neither the schema nor the document data is changed concurrently to them.

This is tolerable because schema changes are rare but will be improved in the future to be less conservative.

## Merge Semantics by Node Kind

TODO: add a separate document for each node kind and link to them from here.
