# SharedTree Merge Semantics

This document offers a high-level description `SharedTree`'s merge semantics.

Target audience: `SharedTree` users and maintainers.

## What Are Merge Semantics?

Merge semantics define how `SharedTree` reconciles concurrent edits.

### Concurrent Edits

When several peers edit the same document, it's possible for some of the edits to be concurrent.
The edits of two clients are concurrent if they each made those edits before they had received the others’ edits from the server.

For example, imagine Alice and Bob are editing a document that contains sticky notes whose background color can be changed.
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
then one could imagine multiple possible outcomes:

-   change the color to red
-   change the color to blue
-   keep the color yellow
-   change the color to purple

`SharedTree`'s merge semantics define which outcome will be picked.

## Why/When Should You Care?

Developers that use `SharedTree` should be able to be productive without constantly worrying about merge semantics.
There are, however, situations that warrant an awareness and understanding of merge semantics.
Those are commonly:

-   The need to understand the experience that end-users will face given the host application's usage of `SharedTree`'s editing capabilities.
-   The need to determine how to use `SharedTree`'s editing capabilities to achieve a desired end-user experience, and whether that experience is achievable in the first place.
-   The need to select a data model (i.e., how a document is structured) for an application so that the application's invariants are upheld by `SharedTree`'s merge semantics.

For example, consider an application whose data model includes two arrays,
with the invariant that the length of one array is expected to always be the same as the length of the other array.
The application's editing code may attempt to keep the two arrays' length in sync by always adding to and removing from both array in equal measure.
Despite that, `SharedTree`'s merge semantics are such that a scenario involving concurrent edits may still lead to a state where the arrays end up with different length.
Understanding `SharedTree`'s merge semantics can help the application author anticipate this invariant violation or (failing that) diagnose it after the fact.
Understanding `SharedTree`'s merge semantics will also enable the application author to understand how to remedy this danger,
either by adopting a data model that prevents the issue (e.g., using a single array of pairs),
or by changing the application's editing code (using transactions and constraints) to circumvent it.

## How We Describe Merge Semantics

The merge semantics of a given kind of edit (e.g., moving a node) define what the impact of the edit will be
depending on what concurrent edits were sequenced before it.
This could be captured in a set of rules of the form:
`if <specific-concurrent-edit> was sequenced before this edit then the outcome of this edit will be <specific-outcome>`.
Capturing the semantics of edits in this way would however be cumbersome because the set of possible concurrent edits and the set possible matching outcome if often open-ended.
We instead describe the merge semantics of each kind of edit by describing its preconditions and postconditions.

It is these preconditions and postconditions that define whether an edit's merge semantics make it suitable for a given scenario.

### Preconditions

The preconditions characterize what must be true in order for the edit to be considered valid and have an effect.
For example, inserting a node of type `Foo` in an array,
requires that the schema associated with that array allows instances of type `Foo`.

Note that in a transaction, each edit's preconditions are added to the preconditions of the transaction.
In other words, the preconditions of a transaction are the union of the preconditions of its edits,
giving transactions "all or nothing" semantics.

[Constraints](#constraints) is a feature that allows transaction authors to add additional preconditions to a transaction.
This makes understanding preconditions a pre-requisite for using constraints,
but constraints can be ignored when it comes to understanding how preconditions affect merge semantics in general.

### Postconditions

The postconditions characterize what is guaranteed to be true about the effect of the edit provided the preconditions were satisfied.
This is often expressed in terms of the resulting state after the edit is applied.
For example, move edits guarantee that the targeted nodes end up at the specified destination.

When expressed in terms of the document state,
these postconditions typically only hold immediately after the edit as opposed to holding indefinitely.
In our move example, edits that come after the move
(whether they were made concurrently or not)
may very well cause those nodes to end up in a different location.

In a transaction, each edit's postconditions are added to the postconditions of the transaction,
with later the postconditions of later edits overriding that of earlier ones whenever they are incompatible.
For example, if a transaction moves a node from location A to location B,
then moves that same node from location B to location C,
the postcondition of the second move (that the node will be at location C) wins out.

### The Absence of Preconditions and Postconditions Matters

The preconditions and postconditions for an edit are important not only for what they include but also what they leave out.

As an example, consider the effect of a move operation:
It detaches some node `X` at location `A` under some parent node `Pa` and re-attaches it at some location `B` under some parent node `Pb`.
The preconditions and postconditions for the current `SharedTree`'s current implementation of move are as follows.

Preconditions:

-   The document schema was not concurrently changed (see [schema changes](#schema-changes)).

Postconditions:

-   Node `X` is at location `B` under `Pb`.

Here are some additional preconditions that one could consider for such an operation:

-   Node `X` was not concurrently moved.
-   Node `X` was not concurrently moved out from under `Pa`.
-   Node `X` was not concurrently removed.
-   Node `Pa` and its ancestors were not concurrently removed.
-   Node `Pb` and its ancestors were not concurrently removed.
-   No other node was moved to location `B`.

By adding some of these preconditions, one might be able to make more guarantees about the effect of the edit, thus leading to additional postconditions.
For example, by adding either of the top two preconditions,
it would be possible to guarantee that there will be one fewer node under `Pa` and one more node under `Pb` than there had been before the edit,
so long as `Pa` and `Pb` are different nodes.

## High-Level Design Choices

`SharedTree` allows developers to describe the data model for their application in terms of a set of elementary building blocks,
like objects nodes, map nodes, and array nodes.
Each of these building blocks comes with its own editing API and associated merge semantics,
so fully understanding the merge semantics of `SharedTree` entails understanding the individual merge semantics of each of these building blocks.
That said, those merge semantics are in large part underpinned by a set of design choices that apply to `SharedTree` as a whole.
Understanding those design choices and their ramifications is the most crucial part of understanding `SharedTree`'s merge semantics,
and often alleviates the need to remember the details of any building blocks's specific merge semantics.

### Movement Is Not Copy

`SharedTree` allows subtrees to be moved from one location to another.
Edits made to a subtree before it is moved will still apply even if they end up (because of concurrency) being applied after the subtree moves.
This is different from inserting a new copy of the moved subtree at the destination
(and deleting the original at the source).

Consider the following scenario:
Alice moves a sticky note from one page to another,
while Bob concurrently edits the text of the note.
If the move were just a copy, then, if Alice's edit were to be sequenced first,
Bob's edit would not apply to the copy at the destination.
By contrast, `SharedTree`'s move semantics ensure that Bob's edit will apply no matter the sequencing order.

### Minimal Preconditions

In choosing the merge semantics of the set of edits initially supported by `SharedTree`,
we have strived to keep the preconditions of those edits minimal.
At this time, with the exception of [schema changes](#schema-changes) which have more preconditions,
all supported edits have the same single precondition:
that the document schema must not have been concurrently changed.

As illustrated [above](#the-absence-of-preconditions-and-postconditions-matters),
there are many other variations in merge semantics we could support for our initial set of edits.
Many of those are likely desirable, and may be supported in the future,
so our preference for minimal sets of preconditions is merely a question of prioritization.

The motivation for this prioritization is that more permissive edits offer support not only for scenarios where the resulting merge outcome is desirable,
but also for scenarios where dropping the whole transaction would be acceptable.
`SharedTree` make the latter possible by using opt-in [constraints](#constraints).

On the other hand, if `SharedTree`'s edits had more preconditions by default,
then there would be no way for users to opt-out of these preconditions,
thereby limiting their ability to express a more permissive edit.

In the rest of this section, we call out some interesting implications that follow from our choice of giving our edits minimal preconditions.

#### Removal Is Movement

`SharedTree` allows subtrees to be removed from the document.
This occurs when an element is removed from an array node,
when a key is deleted from a map node,
or when the field on an object is overwritten or cleared.

Consider the following scenario:
Alice removes a whole page of sticky notes, while Bob concurrently moves a sticky note out of that page and into another (non-removed) page.
`SharedTree`'s removal semantics ensure that Bob will still get his sticky note,
whether or not it ends up happening before or after Alice removed the page where it came from.  
If that weren't the case, then there would be a race between Alice and Bob's edit,
where Bob's edit would not apply if Alice's edit were sequenced first, and Bob would lose the sticky note.

In the case where the subtree is modified in some way as it is removed, those modifications may end up being moot.
However, they will be preserved, and this matters if the removal is undone and the subtree is reintroduced - it will keep the modifications.

These merge semantics effectively make removal akin to a move whose destination is an abstract "removed" location.
This is in tune with the return value of the `treeStatus()` API which will return `TreeStatus.Removed` in that situation.

#### Last Write Wins

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
Note that this is true even when some of those locations are the "removed" location:
if the removal is sequenced last then the node will be moved then removed.
If the move is sequenced last then the node will be removed then moved.

### Simple Postconditions

Similar to our choice regarding preconditions,
we have chosen to prioritize edits whose postconditions are simple.
"Simple" here refers to the property of having a single possible effect.
This is in contrast to preconditions that are predicated on the existence or absence of concurrent edits,
or predicated on some properties of the document state by the time the edit is applied.

For example, the postcondition for our implementation of move
(that the moved node will reside at the chosen destination)
is not predicated on whether the node was concurrently removed or moved.
This means that when it comes to the final location of the node that is targeted by the move,
there is only one possible outcome
(the node being at the chosen destination)
so long as the preconditions of the move were met.

Note that such conditional postconditions would be different from additional preconditions.
For example, adding a precondition that the node moved node must not have been concurrently removed would,
in a situation where that did occur,
render such a move _and the whole transactions it figures in_ invalid.
By contrast, making the postcondition conditional on the node not having been concurrently removed would simply render the move ineffective,
but not adversely affect the rest of the transaction.

As with minimal preconditions, we may support more variations of our current set of edits in the future.

This prioritization is partially guided by the same motivation that guided our choice with minimal preconditions:
it makes more for a greater set of possible edits when combined with [constraints](#constraints).
Another motivation is that simpler postconditions make reasoning about concurrent editing more approachable.
This is most palpable in the context of transactions
because it reduces the number of possible states the document between could be in between the edits that make up the transaction,
therefore making transactions easier to author correctly,
and making the effect of a given transaction easier to understand.

For example, consider an application that allows the end user to select a set of sticky notes across several pages,
and group all of the selected notes under a new page, assigning to each one an ordinal number based on the selection order.
This functionality effectively allows a user to make a numbered list out of a set of sticky nodes.

This can be achieved by writing a transaction that loops through the selected N notes in the order they were selected,
assigning ordinals incrementally and moving each one to the end of the new page.

By the time this transaction is sequenced and applied,
concurrent edits may have affected the relevant sticky notes in different ways:
some of them may have been assigned different ordinals,
some of them may have been moved, removed,
or their parent pages may have been moved or removed.
Despite that, `SharedTree`'s current merge semantics guarantee that
by the end of the transaction all of the relevant sticky notes will reside in the new page,
and that their ordinals will be assigned in order from 1 to N.
If any of the concurrent changes had the power to prevent the relevant notes from being moved by our transaction,
or to prevent them from being annotated with the ordinals,
then our transaction may lead to a state where the new page only contains a subset of the selected notes,
and their ordinals may have gaps, not be unique, and be out of order.
In other words, it would be very hard to make any kind of valuable claim about the effect of the transaction,
and end-users would experience some very confusing outcomes.

More abstractly, for a transaction that is composed of `N` edits (`e1` through `eN`),
you can think of each edit `ei` as having one of `ki` possible effects,
where which of the `ki` possible effects is applied depends on what concurrent edits were sequenced before the transaction.
In aggregate, the effect of a transaction is therefore, in the worst case, one of `k1 * k2 * ... * kN` possible effects.
For a transaction that is composed of 10 edits where each edit has one of two possible effects,
that would mean the transaction would at worst have one of 1024 possible different effects.
`SharedTree`'s semantics guarantee that every `ki` is equal to 1,
meaning each transaction has only one possible effect.

## Constraints

Constrains is a feature that allows transactions authors to add additional preconditions to a transaction,
thereby ensuring that its effect will only apply if some specific conditions are met.
This is useful when the transaction's effect may be rendered undesirable by the effects of concurrent edits that are sequenced before the transaction.

Consider an application whose data model includes two arrays,
with the invariant that the length of one array is expected to always be the same as the length of the other array.
The application allows users to perform the following operations as transactions:

-   Add a new element in each array
-   Remove a single existing element from each array

There's no way for the adding of elements to violate the invariant that the lengths of the two arrays ought to remain the same.
It's possible however for the removal of existing elements to violate this invariant:
consider the starting state `{ arrayA: [a1, a2], arrayB: [b1, b2] }`.
Suppose Alice tries to remove `a1` and `b1`.
Concurrently to that, Bob tries to remove `a1` and `b2`.
No matter the sequencing order between Alice and Bob's transactions,
the resulting state once both are applied will be `{ arrayA: [a2], arrayB: [] }`.

This issue can be addressed by adding a constraint to the transactions that remove elements:
each such transaction can establish a precondition that the nodes to be removed are not already removed.

With such a constraint, the resulting state in the scenario above will depend on the sequencing order:
It will be `{ arrayA: [a2], arrayB: [b2] }` if Alice's transaction was sequence before Bob's
and `{ arrayA: [a2], arrayB: [b1] }` otherwise.

### Schema Changes

As of 2024-04-25,
all edits/transactions have the implicit constraint that the schema is not changed concurrently to them.
Similarly, all schema changes have the implicit constraint that neither the schema nor the document data is changed concurrently to them.

This is tolerable because schema changes are rare.
The merge semantics will be improved in the future to be less conservative.

## Merge Semantics by Node Kind

TODO: add a separate document for each node kind and link to them from here.
