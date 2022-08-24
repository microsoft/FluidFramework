# Merge Tree Obliterate

This document covers motivation, spec, and design for the upcoming "obliterate" feature of merge-tree.

## Spec

A concise description of merge-tree's current merge conflict resolution strategy is as follows:

- Insertion of a text segment only conflicts with other insertions at the same location.
  The conflict is resolved by inserting the segment added later nearer in the string.
  For example, from an initial state of "abc", if the operations [insert "hi " at 0] from client 1
  and [insert "bye " at 0] from client 2 are sequenced in that order, the resulting state is "bye hi abc".
- Range operations (delete, annotate) apply to the range at the time the operation was issued.
  Specifically, insertion of a segment into a range that is concurrently deleted or annotated
  will not result in that inserted segment being deleted or annotated. For example, from an initial state "012",
  the operations [delete the range [1, 3)] from client 1 and [insert "hi" at index 2 (i.e. between "1" and "2")] from client 2,
  the resulting text is "0hi".

The merge outcomes for ranges are easy to understand, but not always desirable.
Oftentimes, when consumers want to work with ranges, they may want their operation to apply to concurrently inserted segments.
In the example above, these semantics would look like so:

```
// Initial state at seq 0: "012"
{ seq: 1, refSeq: 0, clientId: 1, op: <insert "hi" at index 2> }
{ seq: 2, refSeq: 0, clientId: 2, op: <delete the range [1, 3)> }
// final desired state: "0"
```

```
// Initial state at seq 0: "012"
{ seq: 1, refSeq: 0, clientId: 2, op: <delete the range [1, 3)> }
{ seq: 2, refSeq: 0, clientId: 1, op: <insert "hi" at index 2> }
// final desired state: "0"
```

A `SharedString` feature request for a removal operation with these semantics dubbed them "obliterate".

At an implementation level, these semantics can be viewed in two parts:
- The range specification is resolved at the time the op is sequenced
- Any subsequent segments inserted into that range concurrently should also be removed

The first clause handles concurrent inserts before the removal is sequenced, and the second clause handles concurrent inserts after the removal is sequenced.

However, there is a way to view obliterate's semantics as a special case of a "move" operation,
which preserves content identity such that concurrently inserted segments will be inserted to the range at its current location.
A main motivator here from the app perspective might be the idea that if user 1 cut and pastes an entire paragraph to a different section of the document
whiler user 2 edits it, the desired merge outcome would likely be for user 2's edit to apply to the paragraph in its new location.
Roughly, anywhere an application would want obliterate merge semantics on user delete of some content,
the same application would want move semantics if the user instead cut and pasted the content somewhere else.

There have historically been feature requests for move semantics inside merge-tree (for example [issue 8518](https://github.com/microsoft/FluidFramework/issues/8518)),
so it makes sense to do forward-thinking on implementing obliterate in a way that we can extend it to cover move semantics in the future.

For that reason, naming choices of fields and semantics for the remainder of the document will be written in terms of obliterate being the special case
"move this range out of existence".
The current proposal is to use the runtime value "null" to represent "out of existence", but this choice is flexible.
In prose, for terseness that operation will still be called obliterate.
After describing obliterate's design, this document [digs into how the design can be extended to work for move](##Move).

Notice that the above examples always insert text at positions strictly inside the removed range.
If the insert operation was instead before the "1" or after the "2", one can imagine different applications wanting different behavior:
either the obliterated region should expand to include that text, or it should not.
This topic will be covered in the [endpoint behavior](#endpoint-behavior) section,
but for implementation strategy discussion one should assume that the implementation should support both options (and leave it up to applications
to specify).

## Implementation Strategy

This section is focused on implementation of the "obliterate" semantics inside merge tree.
This will constitute the bulk of the complexity of the feature.
Since obliterate is generally a "different kind of remove," there may be a nice abstraction to introduce at the code level to generalize
removal information. However, in favor of introducing niceties later this design document will assume fields are inlined and focus on
the strategy for ensuring eventual consistency. If such an abstraction is introduced, ideally it would enable better "pay-to-play" of
common code paths based on merge-tree feature usage.
As an example, `BaseSegment.split()` needs to copy segment properties to the split segment.
So new properties added to segment will unnecessarily copy undefined values.

There are a few aspects of merge tree's bookkeeping and general feature set that require consideration when designing new op semantics:

- Any changes to direct fields of tree nodes themselves (either new data or changes to bookkeeping of existing data)
- How the feature interacts with an increasing collab window and zamboni
- Impact on the partial lengths scheme
- Bookkeeping and handling of overlapping removals (note some may be obliterates and some may not be)
- Reconnection
- Snapshotting impact

We'll first present an overview of a potential scheme for implementing the obliterate op, then comment on these aspects.

### High-level bookkeeping changes

Segments will be augmented with `movedSeq` and `localMovedSeq` fields which generally align with the semantics of `seq, localSeq, removedSeq,` and `localRemovedSeq`.
When segments are moved and not just obliterated, they will also contain a reference to the destination segment.
This may look as follows:

```typescript
/**
 * Tracks information about when and where this segment was moved to.
 * @example - Suppose a merge tree had 3 TextSegments "X", "A", and "B", and
 * received the operation `move({ start: 0, end: 1 }, { dest: 3 }, { seq: 30 })` (moving the "X"
 * after the "A" and the "B").
 * After processing this operation, it would have the segments `[<moved "X" tombstone>, "A", "B", "X"]`.
 * The moved "X" tombstone segment would have the following IMoveInfo: `{ movedSeq: 30, moveDst: <reference to living "X" segment>}`
 */
export interface IMoveInfo {
    /**
     * Local seq at which this segment was moved if the move is yet-to-be acked. Only set on the tombstone "source" segment of the move.
     */
    localMovedSeq?: number;
    /**
     * Seq at which this segment was moved. Only set on the tombstone "source" segment of the move.
     */
    movedSeq: number;
    /**
     * A reference to the inserted destination segment corresponding to this segment's move.
     * If undefined, the move was an obliterate.
     */
    moveDst?: ReferencePosition;
}

export interface ISegment extends Partial<IRemovalInfo>, Partial<IMoveInfo> {
  // ...
}
```

Note that though `movedSeq` and `localMovedSeq` act very similarly to `removedSeq` and `localRemovedSeq` when considering the length of a segment at a given
perspective: if the perspective is from after the segment was moved, the tombstone segment should have length 0.
However, these fields need to be independent from `removedSeq` due to the possibility of a removal and a move overlapping, as well as the differences
in how concurrent inserts are handled into a removed or a moved range.



TODO: Handling overlapping concurrent moves will likely also require a field analogous to `removedClientIds`

### Remote perspective

We now move to some lower-level implementation details on how to ensure eventual consistency operating in this model.

First, consider the behavior a client must have when processing an obliterate op it didn't submit.
For concreteness and ease of explanation, say this op is `{ seq: 50, refSeq: 40, clientId: 2, op: <move the range [10, 15) to null }`.
The processing client should first mark all segments between the segment `getContainingSegment({ pos: 10, refSeq: 40, clientId: 2 })` and
`getContainingSegment({ pos: 15, refSeq: 40, clientId: 2 })` that are alive (i.e. inserted, not removed) from the perspective
`{ seq: 50, clientId: localClientId }` obliterated.
Note this means that if a segment in the range was concurrently removed, it won't be marked as moved as well.
The marking process should be roughly equivalent to what happens in a "remove" operation, but instead of updating `removedSeq`/`localRemovedSeq`
it updates `movedSeq` and `localMovedSeq`.

The other interesting difference between this operation and a normal removal is its inclusion of segments inserted between seq 40 and seq 50.
The current API on merge tree used for `markRangeRemoved` (which is `mapRange`) doesn't support iterating in this fashion,
but could easily be extended to do so.
One way to do that would be to decouple the `refSeq` and length calculations used for locating the positions and the `refSeq` used for
deciding whether or not to descend and `map` children nodes.

This handles removal of any concurrently inserted segments sequenced before the obliterate op, as well as local ops sequenced after the
obliterate op (since we use `localClientId`).
However, the client still needs to ensure concurrently inserted segments sequenced after the obliterate op are immediately removed.
The insert codepath will therefore need to take into account if the destination is inside of an ongoing moved area.
Excursions are a good tool for this job, but checking is still easier said than done.
Concretely, and continuing with the example operations given above, suppose this insertion happens:

```
{ seq: 60, refSeq: 40, clientId: 3, op: <insert "hello" at index 10> }
```

After locating the insertion point and updating the merge tree, we need to decide if the resulting segment is inside of a moved region.
If we happened to know the `seq` of the move we were testing for, this would be easy: the first adjacent segment in each direction from
the perspective of `{ seq: 50, clientId: localClientId }` can inform us if we're either inside or directly adjacent to that moved range.
Thus, a naive implementation could check all sequence numbers in the collab window.
The obvious optimization of only checking seq numbers of move ops would improve this slightly.
But we can do asymptotically better by leveraging the tree structure.
It would be ideal if we only needed to perform one commonly short excursion in each direction.
The only candidate that makes much sense is from the perspective of `{ seq: 60, clientId: 3 }` (i.e. the client submitting the insert op at
the time the op is sequenced).
The problem with this perspective is that ops 51 through 59 may have inserted a segment between the inserted "hello"
and the obliterated range that was submitted by a client which has already acked the obliterate.
For example, `{ seq: 55, clientId: 5, refSeq: 50, op: <insert "i won't be obliterated" at index 10> }`.

The forward excursion would need to continue past this segment in order to conclude it isn't in an obliterated range.
If that was the only such concurrent insert, the next segment it would visit would be an obliterated one and we'd decide
whether or not to include the newly inserted segment as part of the obliterated region based on some endpoint merge strategy.

The key insight is that visiting the segment with seq 55 does provide the excursion with information: since the segment
was inserted at seq 55 and isn't moved or removed, any move operation must have occurred before seq 55.
If we keep track of the smallest sequence number of alive segments that we've visited, we therefore have an upper bound
for any possible adjacent move op.
Thus, we can halt the excursion as soon as this upper bound falls below the smallest obliterate operation within the collab window.
If we alternatively reach a segment that has been moved concurrently to the insert we're processing, we can also stop
and use the endpoint resolution strategy.

The guarantee we get for a removed segment isn't quite as good: we only know that the move must have come either before
the segment was inserted or after it was removed (since move doesn't impact segments that are removed before its application).
We *could* track this as part of our excursion by maintaining a range of disjoint intervals at which an obliterate "might have happened"
and exiting as soon as we know no obliterate is possible, but this is probably more effort than required: only decreasing our upper bound
for removed segments if our existing upper bound is below when the segment was removed is a reasonable intermediate approach that uses
less bookkeeping overhead.

All-in-all, the insert logic modification might look something like this:

```typescript
function wasRemovedAfter(seg: ISegment, seq: number): boolean {
  return seg.removedSeq !== UnassignedSequenceNumber && seg.removedSeq > seq;
}

function insertingWalk(args /* mostly omitted */, op) {
  /* regular insert logic goes here */

  let moveUpperBound = Number.POSITIVE_INFINITY;
  let movedSegment: ISegment | undefined = undefined;
  const smallestSeqMoveOp = this.getSmallestSeqMoveOp();
  const findAdjacedMovedSegment = (seg) => {
    if (seg.movedSeq && seg.movedSeq > op.referenceSequenceNumber) {
      movedSegment = seg;
      return false;
    }

    if (!isRemovedAndAcked(seg) || wasRemovedAfter(seg, moveUpperBound)) {
      moveUpperBound = Math.min(moveUpperBound, seg.seq);
    }
    // If we've reached a segment that existed before any of our in-collab-window move ops
    // happened, no need to continue.
    return moveUpperBound > smallestSeqMoveOp;
  }
  forwardExcursion(insertSegment, findAdjacedMovedSegment);
  const furtherMovedSegment = movedSegment;
  currentMin = Number.POSITIVE_INFINITY;
  movedSeg = undefined;
  backwardExcursion(insertSegment, findAdjacedMovedSegment);
  const nearerMovedSegment = movedSegment;
  if (
    (nearerMovedSegment && breakEndpointTie(nearerMovedSegment, insertSegment, op)) ||
    (furtherMovedSegment && breakEndpointTie(insertSegment, furtherMovedSegment, op))
  ) {
    // These objects will be analogous to return from `toRemovalInfo`.
    const nearMoveInfo = toMoveInfo(nearerMovedSegment);
    const farMoveInfo = toMoveInfo(furtherMovedSegment);
    // The inserted segment could potentially be adjacent to two different moved regions.
    // We mark it as moved using the info from the earlier such operation.
    const moveInfo = min(nearMoveInfo, farMoveInfo);
    markSegmentMoved(insertSegment, moveInfo, op)
  }
}

```

In reality it will be a bit more complicated: this does not properly handle inserting walks performed for local edits (which should never be immediately obliterated),
nor does it handle local, un-acked obliterates (which will be covered in the next section).
It's worth noting that removals between the obliterated seq and the inserting op's seq don't complicate things much because excursions visit all segments, regardless of visibility.

This limits the segment excursions to not be longer than the number of consecutive segments adjacent to the insertion
point that are all within the collaboration window.
That's probably performant enough, but if we want to optimize further at some memory cost it is probably possible to use the
partialLengths information to skip over blocks in some cases if the sequence numbers of obliterate ops are stored on
each merge block.

### Local perspective

Next, we move to the local handling of a move op while it's in flight.
For consistency with the rest of merge tree's segment state machine, the state transitions of `{ localMovedSeq, movedSeq }` and `{ localRemovedSeq, removedSeq }` should align (`movedSeq` is set to `UnassignedSeqNumber` while the op is in flight with `localMovedSeq` recording the local seq at which the move happened, then on ack of the op `localMovedSeq` is cleared out and `movedSeq` is replaced with the op's seq).

While a move op is in flight, any non-local insertions into a locally moved range need to be immediately moved to the range's current location
(or removed, if it was obliterated).
This can be accomplished by tweaking the `findAdjacentMovedSegment` function above to account for `localMovedSeq`:

```typescript
  const findAdjacentMovedSegment = (seg) => {
    if ((seg.movedSeq && seg.movedSeq > op.referenceSequenceNumber) ||
        seg.localMovedSeq !== undefined) {
      movedSegment = seg;
      return false;
    }

    if (!isRemovedAndAcked(seg) || wasRemovedAfter(seg, moveUpperBound)) {
      moveUpperBound = Math.min(moveUpperBound, seg.seq);
    }
    // If we've reached a segment that existed before any of our in-collab-window move ops
    // happened, no need to continue.
    return moveUpperBound > smallestSeqMoveOp;
  }
```

We don't need to worry about the analogous problem of extending the excursion as a result of segments between the insert location and a local move
because any such segments would have also been marked as locally moved when they were inserted into the merge tree.
In the sample code written for the remote segment, this will also necessitate `markSegmentMoved` to tolerate marking segments with local obliteration info.

Much of the same logic that goes into conflicting local + remote removal will need to be applied for move.
Nothing stands out as a conceptual issue or hurdle in this realm, though. Just tricky conditionals.

Once the op is acked, the behavior in the [Remote perspective](#remote-perspective) section suffices for any further concurrent segments.

### Other aspects

TODO: Fill out this section in detail and with as much care as was taken above. For now (draft PR for early feedback), here is my current thinking on the areas I called out:

- Any changes to direct fields of tree nodes themselves (either new data or changes to bookkeeping of existing data)
> I think `{ obliteratedSeq?: number, localObliteratedSeq?: number }` suffices here. We'll of course need to make sure it's updated where appropriate (segment splits, checks for segment merges, etc.)
- How the feature interacts with an increasing collab window and zamboni
> I don't expect many conceptual issues here given the parallels with removedSeq, but need to do a code audit.
- Impact on the partial lengths scheme
> This does deserve its own section. Current partial lengths bookkeeping works for removal by adding various adjustment entries based on segments' `removedSeq` and overlapping removes fields. We need to update the bookkeeping on initial obliterate handling as well as on immediate-obliterate-on-inserting-walk cases.
- Bookkeeping and handling of overlapping removals (note some may be obliterates and some may not be)
> This was partially covered above. Not sure what else I want to add, but leaving it for now.
- Reconnection
> We might need to do fixup on the local state of the merge tree on reconnection by clearing rebased obliterate ops. I don't think the problem is intractible, and can always be done unperformantly in V1 since reconnection of an obliterate should be relatively uncommon.
- Snapshotting impact
> We'll need to ensure that obliterated info ends up on segments within the collab window. Otherwise I don't see issues here.

## Endpoint Behavior

One important consideration is what happens near the endpoints of the removed range.
There are two general possibilities: either the obliterate expands to include segments inserted
adjacent to the endpoint, or it does't.

```typescript

/** @sealed */
interface IEndpointMergeStrategy {
  // TODO
}

/** @sealed */
interface IRangeMergeStrategy {
  start: IEndpointMergeStrategy;
  end: IEndpointMergeStrategy;
}

```

## Public API

The public API of sequence will need to be updated for users to leverage the obliterate operation.

```typescript
class SharedSegmentSequence<TInterval extends IInterval> {
  public obliterateRange(start: number, end: number, merger: IRangeMergeStrategy = expand)
}
```

## Move

There are several different possible options for defining merge outcomes for the "move" operation.
The upcoming SharedTree DDS has done a lot of thinking in this area and landed on a relatively simple set of semantics that give reasonable
outcomes in most cases (see [issue 9658](https://github.com/microsoft/FluidFramework/issues/9658) for some very detailed reading).

These semantics are implementable in merge-tree, are compatible with feature requests for obliterate, and generally seem like a good direction to take
that we can later extend if applications request.

There are a few primitive concepts that all of the merge outcomes depend on.

First, a sequence of length `N` is conceptualized as an interleaving set of `N+1` *gaps* and `N` nodes.
Nodes in the sequence may move, but the gaps between the nodes do not.

Insertion into the sequence is performed by specifying a gap to insert in as well as a direction that the inserted content prefers to tend toward
in case other content is inserted/moved concurrently into the same gap.

> Merge-tree already conceptualizes insert locations similarly: it names the gaps `0` through `N`. It does not permit app-level specification of concurrent merges,
> but that degree of freedom doesn't need to be exposed.

Next, there are two types of range specifications: *set ranges* and *slice ranges*.

A *set range* targets exactly the objects in a given range at the time it was specified. In merge-tree terms, the segments that the range affects are
resolved from the perspective of the submitting client at its refSeq, and only those segments undergo whatever operation applies (move, annotate, remove).

> Merge-tree's `remove` operation has set range semantics, since it doesn't cause removal of any concurrently inserted segments.
> It's worth noting that a move operation with set range semantics is conceivable inside this framework, and not something merge-tree currently implements.
> E.g., if the set range "CDE" inside a string "ABCDEF" was moved to the end of the string, and someone concurrently moved "B" and "C" to the start,
> the string may end up "BAFCDE" or "BCAFDE" depending on the sequencing order of the moves.

Finally, a *slice range* specifies a start location and an end location, where a location has the same object shape as an insert destination: a gap plus a merge direction.
The range of nodes that the operation affects is interpreted at the time the operation applies, and any concurrent insertions/moves of content *into* that range
are also affected.

> These semantics align with the proposed merge-tree `move` operation. Like insert, we can fix the direction things should merge
> (in this case it instead affects which way the move "expands") if consumers don't need the extra degrees of freedom.

Notice that because gaps don't move, this set of semantics doesn't suffer from problems like a range specification becoming invalid (which happens with
how the legacy shared-tree assigns semantics to its ops, where each is relative to an id).
It also gives reasonable merge outcomes which basically amount to "first move wins."
Consider the following two troublesome cases of overlapping move.

#### Move within a move

```
// Initial state: "12345 AB CD"
{ seq: 1, refSeq: 0, clientId: 1, op: <move 2 through 4 to after "A"> } // (all of the op specification would actually be in terms of indices)
{ seq: 2, refSeq: 0, clientId: 2, op: <move 3 to after paragraph "C"> }
```

One can see with this order of sequencing, we'd end up with "15 A234B CD".
With the other order, we'd get "15 A24B C3D".

Both outcomes are reasonable; clients 1 and 2 effectively expressed opposing desires on where the 3 should go.

#### Move of a single endpoint past the other

```
// Initial state: "Paragraph 1<br>Paragraph 2<br>Paragraph 3<br>Paragraph 4<br>Paragraph 5"
{ seq: 1, refSeq: 0, clientId: 1, op: <move paragraphs 2 through 3 to the gap after paragraph 5> } // (all of the op specification would actually be in terms of indices)
{ seq: 2, refSeq: 0, clientId: 2, op: <move paragraphs 3 through 4 to the gap after paragraph 5> }
```

Client 1's op succeeds without conflict, giving intermediate state order of the paragraphs "14523".
Then client 2's op has a start endpoint targetting a tombstoned segment for paragraph 3, so it only affects paragraph 4.
The final state is "15423" since merge-tree chose near-merge-later.

If the ops are sequenced in the other order, the final state would instead be "15234".

Both of these outcomes are again generally plausible.
