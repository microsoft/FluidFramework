# Merge Semantics of Edits on Array Nodes

This document describes the semantics of edits that can be performed on array nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics are defined in terms of the edit's preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
A postcondition defines a guarantee that is made about the effect of the edit.
(Invalid edits are ignored along with all other edits in the same transaction, and postconditions do not hold).

## Key Challenges and Solutions

Before delving into the set editing operations supported by ShardTree arrays,
it's helpful to understand the key challenges that come up when users are allowed to concurrently edit the same array,
and how ShardTree arrays address these challenges.

### Specifying the Location of Inserted Items

#### The Problem

Array operations that insert (or move in) array items take an integer that describes where in the array the new item(s) should be added.
For example, we can call `insertAt(1, "o")` to insert the value `"o"` in the array `["c", "a", "t"]` thus changing it to  `["c", "o", "a", "t"]`.

In a collaborative editing environment,
it's possible for the state of the array to change between the time the edit is first created and the time it is applied.
Consider what would happen if the argument that describes the destination of the insert were to be treated as a fixed integer index:

Example 1:
* Starting state: `["c", "a", "t"]`
* Alice's edit: `insertAt(0, "r", "e", "d", " ")` with the expectation of getting `["r", "e", "d", " ", "c", "a", "t"]`.
* Bob's edit: `insertAt(1, "o")` with the expectation of getting `["c", "o", "a", "t"]`.

If Alice and Bob's edits are concurrent, and Alice's edit is sequenced first,
then inserting `"o"` at index 1 would yield `["r", "o", "e", "d", " ", "c", "a", "t"]`.
This would not truly match the intention of Bob,
who would likely have wanted to get `["r", "e", "d", " ", "c", "o", "a", "t"]` instead.

Example 2:
* Starting state: `["r", "e", "d", " ", "c", "a", "t"]`
* Alice's edit: `removeRange(0, 4)` with the expectation of getting `["c", "a", "t"]`.
* Bob's edit: `insertAt(5, "o")` with the expectation of getting `["r", "e", "d", " ", "c", "o", "a", "t"]`.

If Alice and Bob's edits are concurrent, and Alice's edit is sequenced first,
then inserting `"o"` at index 5 would either crash or yield `["c", "a", "t", "o"]`.
This would not truly match the intention of Bob,
who would likely have wanted to get `["c", "o", "a", "t"]` instead.

#### The Solution: Inserting in Gaps

Instead of treating the destination parameter of insert and move operations as a fixed insertion index,
SharedTree's array implementation interprets that parameter as referring to a gap in the array.

For example, in an array with two items `[A, B]` there are three gaps:
one before A, one between A and B, and one after C.
If we represented gaps with the `_` character, then would describe the array `[A, B]` as `[ _ A _ B _ ]`.
(More generally, an array with `K` items has `K+1` gaps.)

This means that calling `insertAt(1, "o")` on an array with initial state `["c", "a", "t"]`
singles out the following gap as the location to perform the insert: `["c" _ "a" "t"]`.
This conversion from index 1 to the corresponding gap is done at the time the edit is first created.
SharedTree's array implementation then keeps track of that gap's position when reconciling this insertion against concurrent edits.
Reusing the scenario from example 1 in the previous section,
the gap's position after reconciling with the concurrent edit from Alice (`insertAt(0, "r", "e", "d", " ")`)
is as follows: `["r" "e" "d" " " "c" _ "a" "t"]`,
thus yielding the adequate result after inserting "o" `["r", "e", "d", " ", "c", "o", "a", "t"]`.

#### Tie-Breaking

Note that multiple edits may concurrently attempt to insert or move in items into the same gap.
When that's the case,
the items end up ordered such that the items inserted by the edit that is sequenced earlier will appear after the items inserted by the edits that is sequenced later.

Example:
* Starting state: `[]`
* Edit 1: (concurrently to edits 2 and 3) insert items A and B (this changes the state from `[]` to `[A, B]`)
* Edit 2: (concurrently to edits 1 and 3) insert items R and S (this changes the state from `[]` to `[R, S]`)
* Edit 3: (concurrently to edits 1 and 2) insert items X and Y (this changes the state from `[]` to `[X, Y]`)

If the edits are sequenced in increasing order (i.e., edit 1, edit 2, edit 3),
then the resulting state will be `[X, Y, R, S, A, B]`.

#### Noteworthy Implications

Creating an edit that inserts items before or after an existing item in an array will not necessarily insert next to that item.
For example, inserting item X at the start of array `[Y, Z]` does not guarantee that X and Y will both appear together (in that order)
if other users make concurrent edits to the array.

Example 1: concurrent insert
* Starting state: `[Y, Z]`
* Alice's edit: insert A at the start of the array.
* Bob's edit: insert X at the start of the array.
If Alice's edit is sequenced before Bob's,
then the result will be `[X, A, Y, Z]`.

Example 2: concurrent remove
* Starting state: `[Y, Z]`
* Alice's edit: remove Y.
* Bob's edit: insert X at the start of the array.
No matter the order in which these edits are sequenced,
the result will be `[X, Z]`.

Example 3: concurrent move
* Starting state: `[Y, Z]`
* Alice's edit: move Y after Z.
* Bob's edit: insert X at the start of the array.
No matter the order in which these edits are sequenced,
the result will be `[X, Z, Y]`
as opposed to `[Z, X, Y]` which one might have expected if they thought of the insertion as happening "before Y".

The takeaway from these examples is that while it's tempting to think of an insertion as occurring before or after an existing item,
that doesn't quite match the merge semantics we have implemented.
If you find yourself wishing for different merge semantics please reach out to the Fluid team.

### Specifying the Set of (Re)Moved Items

Each move or remove operations affects a specific set of array items.
When a single item is targeted,
the item can be specified using its index in the current state.
For example, removing the `"o"` from `["c", "o", "a", "t"]` with `removeAt(1)`.

When targeting multiple contiguous items,
it is possible specify them as a range.
For example, `"o"` and `"a"` from `["c", "o", "a", "t"]` with `removeRange(1, 3)`.

From the point of view of merge semantics,
calling `removeRange(1, 3)` is equivalent to individually removing each of the two middle letters in one transaction.
Using the range-based API is typically more convenient.
It is also optimized to have less overhead than making separate calls for each individual item.

The same is true for `moveRange` compared to `moveAt`,
with the additional property that `moveRange` preserves the order that the items are in at the time the edit is created.

Example:
* Starting state `[A, B, C]`
* Edit 1: `moveRange(0, 1, 2)` (move B in the gap before A, yielding `[B, A, C]`)
* Edit 2: `moveRange(3, 0, 2)` (move A and B in the gap after C, yielding `[C, A, B]`)

If edit 1 is sequenced first, then, when edit 2 is finally applied,
the state will change from `[B, A, C]` to `[C, A, B]`.
If edit 2 is sequenced first, then, when edit 1 is finally applied,
the state will change from `[C, A, B]`to `[B, C, A]`.

#### The Problem

In a collaborative editing environment,
it's possible for the state of the array to change between the time the edit is first created and the time it is applied.
Consider what would happen if the arguments that describe the affected items were to be treated as fixed integer indexes:  
* Starting state: `["c", "o", "a", "t"]`
* Alice's edit: `insertAt(0, "r", "e", "d", " ")` with the expectation of getting `["r", "e", "d", " ", "c", "o", "a", "t"]`.
* Bob's edit: `removeAt(1)` with the expectation of getting `["c", "a", "t"]`.

If Alice and Bob's edits are concurrent, and Alice's edit is sequenced first,
then removing the item at index 1 would yield `["r", "d", " ", "c", "o", "a", "t"]`.
This would not truly match the intention of Bob,
who would likely have wanted to get `["r", "e", "d", " ", "c", "a", "t"]` instead.

#### The Solution: Targeting Items

Instead of treating the parameters of move and remove as a fixed index to detach items at,
SharedTree's array implementation interprets these parameter as referring to the items themselves.
In other words, `removeAt(1)` doesn't mean "remove whichever item happens to be at index 1 when the edit is applied".
Instead, it means "remove the specific item that is currently at index 1, no matter what index that item it at when the edit is applied".

#### Noteworthy Implications

Inserting items within a range that is concurrently being moved has no impact on the set of moved items.
For example, if one user moves items A and B to the end of array `[A, B, C]` by using a `sourceStart` of 0 and a `sourceEnd` of 2,
and some other user concurrently inserts some item X between A and B (thus changing the state to `[A, X, B, C]`),
then the move will still affect items A and B (and only these), thus yielding `[X, C, A, B]`.
This is true no matter how the concurrent edits are ordered.

If multiple users concurrently attempt to move the same item, the conflict is resolved in a last-write-wins fashion.
For example, if one user moves item B leftward to the start of array `[A, B, C]`,
and some other user concurrently moves item B rightward to the end of the array,
then the item will be affected by each successive move in sequencing order:
* If the leftward move is sequenced before the rightward move
  then A will first be moved to the start (thus yielding `[B, A, C]`)
  then moved to the end (thus yielding `[A, C, B]`).
* If the rightward move is sequenced before the leftward move
  then A will first be moved to the end (thus yielding `[A, C, B]`)
  then moved to the start (thus yielding `[B, A, C]`).

A removed item may be restored as a result of a concurrent move operation
and a moved item may be removed as a result of a concurrent remove operation.
For example, if one user moves item A to the end of array `[A, B, C]`,
and some other user concurrently removes item A,
then the item will be affected by each successive operation in sequencing order:
* If the move is sequenced before the remove
  then A will first be moved to the end of the array (thus yielding `[C, B, A]`)
  then removed (thus yielding `[C, B]`).
* If the remove is sequenced before the move
  then A will first be removed (thus yielding `[C, B]`)
  then moved (thus yielding `[C, B, A]`).

## Core Editing Operations

### `insertAt(gapIndex: number, ...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`

Inserts new items at the location described by `gapIndex`.

Preconditions:
* There is no concurrent schema change edit that is sequenced before this one.
* The inserted values must have status `TreeStatus.New` or be primitives.
  (This precondition will be removed soon)

Postconditions:
* The values are inserted in the targeted [gap](#location-of-inserted-items).

### `moveRangeToIndex(destinationGap: number, sourceStart: number, sourceEnd: number, source: TMoveFrom): void`

Moves the specified items from the given source array to the desired location within the array.

Preconditions:
* There is no concurrent schema change edit that is sequenced before this one.

Postconditions:
* The [specified items](#specifying-the-set-of-removed-items) are moved to the targeted [gap](#location-of-inserted-items).

If multiple clients concurrently move an item,
then that item will be moved to the destination indicated by the move of the client whose edit is sequenced last.

### `removeRange(start?: number, end?: number): void`

Removes the items between the specified indices.

Preconditions:
* There is no concurrent schema change edit that is sequenced before this one.

Postconditions:
* The [specified items](#specifying-the-set-of-removed-items) are removed.

Removed items are saved internally for a time in case they need to be restored as a result of an undo operation.
Changes made to them by concurrent edits will apply despite their removed status.

## Other Operations

The following operations are just syntactic sugar:

`insertAtStart(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`
equates to `array.insertAt(0, ...value)`.

`insertAtEnd(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`
equates to `array.insertAt(array.length, ...value)`.

`moveRangeToIndex(destinationGap: number, sourceStart: number, sourceEnd: number): void`
equates to `array.moveRangeToIndex(destinationGap, sourceStart, sourceEnd, array)`.

`moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void`
equates to `array.moveRangeToIndex(0, sourceStart, sourceEnd, source)`.

`moveRangeToStart(sourceStart: number, sourceEnd: number): void`
equates to `array.moveRangeToIndex(0, sourceStart, sourceEnd, array)`.

`moveToIndex(destinationGap: number, sourceIndex: number, source: TMoveFrom): void`
equates to `array.moveRangeToIndex(destinationGap, sourceIndex, sourceIndex+1, source)`.

`moveToIndex(destinationGap: number, sourceIndex: number): void`
equates to `array.moveRangeToIndex(destinationGap, sourceIndex, sourceIndex+1, array)`.

`moveToStart(sourceIndex: number, source: TMoveFrom): void`
equates to `array.moveRangeToIndex(0, sourceIndex, sourceIndex + 1, source)`.

`moveToStart(sourceIndex: number): void`
equates to `array.moveRangeToIndex(0, sourceIndex, sourceIndex + 1, array)`.

`moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void`
equates to `array.moveRangeToIndex(array.length, sourceStart, sourceEnd, source)`.

`moveRangeToEnd(sourceStart: number, sourceEnd: number): void`
equates to `array.moveRangeToIndex(array.length, sourceStart, sourceEnd, array)`.

`moveToEnd(sourceIndex: number, source: TMoveFrom): void`
equates to `array.moveRangeToIndex(array.length, sourceIndex, sourceIndex + 1, source)`.

`moveToEnd(sourceIndex: number): void`
equates to `array.moveRangeToIndex(array.length, sourceIndex, sourceIndex + 1, array)`.

`removeAt(index: number): void`
equates to `array.removeRange(index, index + 1)`

## Additional Notes

### Operations on Removed Arrays

All of the above operations are effective even when the targeted array has been moved or removed.

### Removing and Re-inserting Items

When dealing with plain JavaScript arrays,
it is possible to move items around by removing them and adding them back in.
For example, the item C can be moved to the start of the array `[A, B, C]` performing the following operations:
```typescript
const C = array.pop(); // Remove C -> [A, B]
array.unshift(C); // Insert C at the start -> [C, A, B]
```

As of October 2024, SharedTree arrays do not support this pattern because it would require (re)inserting item C, which has previously been inserted.
Instead, it is necessary to use the move operation:
```typescript
array.moveToStart(2);
```
Work is underway to address this lack of flexibility.

### Replacing Items

When dealing with plain JavaScript arrays, it is possible to replace items.
For example, in array  `[A, B, C]`,
the item B can be replaced with item X with [the `splice` method](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice):
```typescript
array.splice(1, 1, X);
```
...or simply by using the `=` operator:
```typescript
array[1] = X;
```

As of October 2024, SharedTree arrays do not support either of these approaches.
The closest alternative is to remove and insert items in two separate calls:
```typescript
array.removeAt(1);
array.insertAt(1, X);
```

Note that this approach may not yield ideal merge outcomes when it comes to concurrent insertions.

Example:
* Starting state: `["gold", "bronze"]`
* User 1: replace "gold" and "bronze" with "1st place" and "3rd place":
  * `removeRange(0, 2)`
  * `insertAt(0, "1st place", "3rd place")`
* User 2: insert "2nd place" between "gold" and "bronze":
  * `insertAt(1, "2nd place")`
* Merge outcome: `["1st place", "3rd place", "2nd place"]`

This outcome is not consistent with the idea of replacement
which would have yielded `["1st place", "2nd place", "3rd place"]` instead.
This is because removing and inserting does not update the original items in place.
So we effectively end up with `["1st place", "3rd place", `~~`"gold"`~~`, "2nd place", `~~`"bronze"`~~`]`.

If in-place replacement is critical to you application's needs,
please reach out to the Fluid team.