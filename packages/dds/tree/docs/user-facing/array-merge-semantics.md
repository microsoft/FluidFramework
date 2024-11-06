# Merge Semantics of Edits on Array Nodes

This document describes the semantics of edits that can be performed on array nodes.

Target audience: `SharedTree` users and maintainers.

> While this document is self-contained, we recommend reading about [SharedTree's approach to merge semantics](merge-semantics) first.

Each edit's merge semantics is defined in terms of its preconditions and postconditions.
A precondition defines a requirement that must be met for the edit to be valid.
(Invalid edits are ignored along with all other edits in same transaction, and postconditions do not hold)
A postcondition defines a guarantee that is made about the effect of the edit.

## Gaps

The merge semantics of array operations that attach array elements (i.e., inserts and moves) are based on the concept of a gap.
A gap is a location where array elements can be inserted or moved.
For example, in an array with two nodes `[A, B]` there are three gaps: one before A, one between A and B, and one after C.
If we represented gaps with the `_` character, then would describe the array `[A, B]` as `[ _ A _ B _ ]`.
(More generally, an array with `K` nodes as `K+1` gaps.)

To insert a new node X in the gap between nodes A and B,
one would call `insertAt(1, X)` because the integer `1` refers to the second gap.

This seems consistent with how insertions are typically performed:
on a plain JS array, one would call `splice(1, 0, X)` to perform the same operation.
The reason we need this concept of gap is that `insertAt(1, X)` will not necessarily insert X at index 1.
Instead, `insertAt(1, X)` will insert X *in the gap that was at index 1 at the time the edit was made*.
This is important because by the time the edit is applied, that gap may no longer be at index 1.

Example 1:
* Starting state: `[A, B]`
* User 1: (currently to user 1) insert node W before A (this changes the state from `[A, B]` to `[W, A, B]`)
* User 2: (currently to user 2) insert node X between A and B (this changes the state from `[A, B]` to `[A, X, B]`)

If user 1's change is sequenced before user 2's change,
then the gap that X is inserted into will be at index 2, yielding `[W, A, X, B]`.
If X had been inserted at index 1 then the result would have been `[W, X, A, B]`.

Example 2:
* Starting state: `[A, B]`
* User 1: (currently to user 1) remove node A (this changes the state from `[A, B]` to `[B]`)
* User 2: (currently to user 2) insert node X between A and B (this changes the state from `[A, B]` to `[A, X, B]`)

If user 1's change is sequenced before user 2's change,
then the gap that X is inserted into will be at index 0, yielding `[X, B]`.
If X had been inserted at index 1 then the result would have been `[B, A]`.

Note that multiple edits may concurrently attempt to insert or move in elements into the same gap.
When that's the case, the elements end up ordered based on the edit sequencing service such that the elements inserted by the edit that is sequenced earlier will appear after the elements inserted by the edits that is sequenced later.

Example:
* Starting state: `[]`
* User 1: (currently to users 2 and 3) insert nodes A and B (this changes the state from `[]` to `[A, B]`)
* User 2: (currently to users 1 and 3) insert nodes R and S (this changes the state from `[]` to `[R, S]`)
* User 3: (currently to users 1 and 2) insert nodes X and Y (this changes the state from `[]` to `[X, Y]`)

If the edits are sequenced in order of increasing user number,
then the resulting state will be `[X, Y, R, S, A, B]`.

## `insertAt(gapIndex: number, ...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`

Inserts new elements at the location described by `gapIndex`.

Preconditions:
* There is no schema change edit that this edit is both concurrent to and sequenced after.
* If the new value is an internal node (i.e., an object, map, or array), that node has never been part of the document tree before.
  (This precondition will be removed soon)

Postconditions:
* The new value is located where the [gap](#gaps) described by `gapIndex` used to be.
  * If multiple values are inserted, then the first value is located at the given index,
    the second value is located at the index after that, etc.

## `insertAtStart(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`

Equivalent to `array.insertAt(0, ...value)`.

## `insertAtEnd(...value: readonly (TNew | IterableTreeArrayContent<TNew>)[]): void`

Equivalent to `array.insertAt(array.length, ...value)`.

## `moveRangeToIndex(destinationGap: number, sourceStart: number, sourceEnd: number, source: TMoveFrom): void`

Moves the specified items from the given source array to the desired location within the array.

Preconditions:
* There is no schema change edit that this edit is both concurrent to and sequenced after.

Postconditions:
* The items that were between the `sourceStart` and `sourceEnd` indices are located where the destination [gap](#gaps) used to be.
  * The set of items being moved is determined at the time the edit is first made (as opposed to when the edit is applied).
  For example, if one user moves nodes A and B to the end of array `[A, B, C]` by using a `sourceStart` of 0 and a `sourceEnd` of 2,
  and some other user concurrently inserts some node X between A and B (thus changing the state to `[A, X, B, C]`),
  then the move will still affect nodes A and B (and only these), thus yielding `[X, C, A, B]` as opposed to `[C, A, X, B]` or `[B, C, A, X]`.
  * The items will end up in the order they were in at the time the edit is first made (as opposed to when the edit is applied).
  For example, if one user moves nodes A and B to the end of array `[A, B, C]` by using a `sourceStart` of 0 and a `sourceEnd` of 2,
  and some other user concurrently swaps the order of A and B (thus changing the state to `[B, A, C]`),
  then the outcome will still be `[C, A, B]` as opposed to `[C, B, A]`.

## `moveRangeToIndex(destinationGap: number, sourceStart: number, sourceEnd: number): void`

Equivalent to `array.moveRangeToIndex(destinationGap, sourceStart, sourceEnd, array)`.

## `moveRangeToStart(sourceStart: number, sourceEnd: number, source: TMoveFrom): void`

Equivalent to `array.moveRangeToIndex(0, sourceStart, sourceEnd, source)`.

## `moveRangeToStart(sourceStart: number, sourceEnd: number): void`

Equivalent to `array.moveRangeToIndex(0, sourceStart, sourceEnd, array)`.

## `moveToStart(sourceIndex: number, source: TMoveFrom): void`

Equivalent to `array.moveRangeToIndex(0, sourceIndex, sourceIndex + 1, source)`.

## `moveToStart(sourceIndex: number): void`

Equivalent to `array.moveRangeToIndex(0, sourceIndex, sourceIndex + 1, array)`.

## `moveRangeToEnd(sourceStart: number, sourceEnd: number, source: TMoveFrom): void`

Equivalent to `array.moveRangeToIndex(array.length, sourceStart, sourceEnd, source)`.

## `moveRangeToEnd(sourceStart: number, sourceEnd: number): void`

Equivalent to `array.moveRangeToIndex(array.length, sourceStart, sourceEnd, array)`.

## `moveToEnd(sourceIndex: number, source: TMoveFrom): void`

Equivalent to `array.moveRangeToIndex(array.length, sourceIndex, sourceIndex + 1, source)`.

## `moveToEnd(sourceIndex: number): void`

Equivalent to `array.moveRangeToIndex(array.length, sourceIndex, sourceIndex + 1, array)`.

## `removeRange(start?: number, end?: number): void`

Removes all items between the specified indices.

## `removeAt(index: number): void`

Equivalent to `array.removeRange(index, index + 1)`.

## Noteworthy Implications

* 
