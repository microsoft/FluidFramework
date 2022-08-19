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
One set of implemetable semantics would be rather than the range operation applying to a range of character positions at the
time the operation is issued, it applies at the time the operation is sequenced.
Consider that:

```
// Initial state at seq 0: "012"
{ seq: 1, refSeq: 0, clientId: 1, op: <insert "hi" at index 2> }
{ seq: 2, refSeq: 0, clientId: 2, op: <delete the range [1, 3)> }
```

would result in the text "0". However, if those concurrent operations were sequenced in the opposite order:

```
// Initial state at seq 0: "012"
{ seq: 1, refSeq: 0, clientId: 2, op: <delete the range [1, 3)> }
{ seq: 2, refSeq: 0, clientId: 1, op: <insert "hi" at index 2> }
```

we'd still end up with the text "0hi".

One option is even more extreme: not only does the range operation apply to the range at the time the op is sequenced,
it also applies to any subsequent segments that get concurrently inserted into this range.
Under these semantics, both orders of sequencing the above operations would result in the text "0".

This final set of merge semantics is known as "obliterate".

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

### Remote perspective

First, consider the behavior a remote client must have when processing an obliterate op.
For concreteness and ease of explanation, say this op is `{ seq: 50, refSeq: 40, clientId: 2, op: <obliterate the range [10, 15) }`.
The processing client must first mark all segments between the segment `getContainingSegment({ pos: 10, refSeq: 40, clientId: 2 })` and
`getContainingSegment({ pos: 15, refSeq: 40, clientId: 2 })` from the perspective `{ seq: 50, clientId: localClientId }` removed.
The difference between this operation and a normal removal is its inclusion of segments inserted between seq 40 and seq 50.
The current API on merge tree used for `markRangeRemoved` (which is `mapRange`) doesn't support iterating in this fashion,
but could easily be extended to do so.
One way to do that would be to decouple the `refSeq` and length calculations used for locating the positions and the `refSeq` used for
deciding whether or not to descend and `map` children nodes.

This handles removal of any concurrently inserted segments sequenced before the obliterate op, as well as local ops sequenced after the
obliterate op (since we use `localClientId`).
However, the client still needs to ensure concurrently inserted segments sequenced after the obliterate op are immediately removed.
The insert codepath will therefore need to take into account if the destination is inside of an ongoing obliteration area.
This can be checked if we mark obliterated segments with the sequence number at which they were obliterated.
This needs to be independent from `removedSeq` (i.e. cannot just be a boolean indicating whether the removal was an obliterate) due
to the possibility of a regular removal and an obliterate overlapping.
Once obliterated segments are marked with their `obliteratedSeq`, the inserting walk must perform excursions in each direction until
it is sure the insertion isn't amidst an ongoing obliteration.

This is easier said than done: concretely, and continuing with the example number given above, suppose this insertion happens:
```
{ seq: 60, refSeq: 40, clientId: 3, op: <insert "hello" at index 10> }
```

After locating the insertion point and updating the merge tree, we need to decide if the resulting segment is inside of an obliterated region.
If we happened to know the `seq` of the obliteration we were testing for, this is easy: the first adjacent segment in each direction from
the perspective of `{ seq: 50, clientId: localClientId }` can inform us if we're either inside or directly adjacent to an obliterated range.
Thus, a naive implementation could check all sequence numbers in the collab window.
The obvious optimization of only checking seq numbers of obliterate ops would improve this slightly.
We can do asymptotically better by leveraging the tree structure.
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
was inserted at seq 55 and isn't obliterated, any obliterate operation must have occurred before seq 55.
If we keep track of the smallest sequence number that we've visited, we can halt the excursion as soon as it falls below
the smallest obliterate operation within the collab window.
If we alternatively reach a segment that has been obliterated concurrently to the insert we're processing, we can also stop
and use the endpoint resolution strategy.

All-in-all, the insert logic modification might look something like this:

```typescript
function insertingWalk(args /* mostly omitted */, op) {
  /* regular insert logic goes here */

  let currentMin = Number.POSITIVE_INFINITY;
  let obliteratedSegment: ISegment | undefined = undefined;
  const smallestSeqObliterateOp = this.getSmallestSeqObliterateOp();
  const findAdjacentObliteratedSegment = (seg) => {
    if (seg.seq === UnassignedSequenceNumber) {
      // Ignore un-acked segments
      return true;
    }

    if (seg.obliteratedSeq && seg.obliteratedSeq > op.referenceSequenceNumber) {
      obliteratedSegment = seg;
      return false;
    }

    currentMin = Math.min(currentMin, seg.seq);
    // If we've reached a segment that existed before any of our in-collab-window obliterate ops
    // happened, no need to continue.
    return currentMin > smallestSeqObliterateOp;
  }
  forwardExcursion(insertSegment, findAdjacentObliteratedSegment);
  const furtherObliteratedSegment = obliteratedSegment;
  currentMin = Number.POSITIVE_INFINITY;
  obliteratedSeg = undefined;
  backwardExcursion(insertSegment, findAdjacentObliteratedSegment);
  const nearerObliteratedSegment = obliteratedSegment;
  if (
    (nearerObliteratedSegment && breakEndpointTie(nearerObliteratedSegment, insertSegment, op)) ||
    (furtherObliteratedSegment && breakEndpointTie(insertSegment, furtherObliteratedSegment, op))
  ) {
    // These objects will be analogous to return from `toRemovalInfo`.
    const nearObliterateInfo = toObliterateInfo(nearerObliteratedSegment);
    const farObliterateInfo = toObliterateInfo(furtherObliteratedSegment);
    // The inserted segment could potentially be adjacent to two different obliterated regions.
    // We mark it as obliterated using the info from the earlier such operation.
    const obliteratingInfo = min(nearObliterateInfo, farObliterateInfo);
    markSegmentObliterated(insertSegment, obliteratingInfo, op)
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

Next, we move to the local handling of an obliterate op while it's in flight.
For consistency with the rest of merge tree's segment state machine, a `localObliteratedSeq` field should be added to `IRemovalInfo`,
and the state transitions of `{ localObliteratedSeq, obliteratedSeq }` and `{ localRemovedSeq, removedSeq }` should align (`obliteratedSeq` is set to `UnassignedSeqNumber` while the op is in flight with `localObliteratedSeq` recording the local seq at which the obliterate happened, then on ack of the op `localObliteratedSeq` is cleared out and `obliteratedSeq` is replaced with the op's seq).

While an obliterate op is in flight, any non-local insertions into a locally obliterated range need to be immediately removed. This can be accomplished by tweaking the `findAdjacentObliteratedSegment` function above to account for `localObliteratedSeq`:

```typescript
  const findAdjacentObliteratedSegment = (seg) => {
    if (seg.seq === UnassignedSequenceNumber) {
      // Ignore un-acked segments
      return true;
    }

    if ((seg.obliteratedSeq && seg.obliteratedSeq > op.referenceSequenceNumber) ||
        seg.localObliteratedSeq !== undefined) {
      obliteratedSegment = seg;
      return false;
    }

    currentMin = Math.min(currentMin, seg.seq);
    // If we've reached a segment that existed before any of our in-collab-window obliterate ops
    // happened, no need to continue.
    return currentMin > smallestSeqObliterateOp;
  }
```

We don't need to worry about the analogous problem of extending the excursion as a result of segments between the insert location and a local obliterate
because any such segments would have also been marked as locally obliterated when they were inserted into the merge tree.
In the sample code written for the remote segment, this will also necessitate `markSegmentObliterated` to tolerate marking segments with local obliteration info.

Much of the same logic that goes into conflicting local + remote removal will need to be applied for obliterate.
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

## Relation to "Move"

TODO: Move is incredibly tricky because unlike removal, it can nest to arbitrarily complex levels. Certain sequences of moves don't even have clear outcomes,
e.g. from an initial state "ABCD", the operations "move AB to between C and D" and "move CD to between A and B" can happen concurrently, endpoints can get flipped
("move A to after B" and "move C to between A and B").
Shared-Tree took the most straightforward approach to solving this, by giving its merge semantics an escape hatch which allows edits to fail to apply in such cases.
If we wanted to take that approach, many of the ideas described above are still relevant, and a potential implementation might leave tombstone "moved" segments
with local references pointing to the new segment locations.
Figuring out how to efficiently allow a local edit fail to apply is much more difficult in merge-tree's model than shared-tree, though.
