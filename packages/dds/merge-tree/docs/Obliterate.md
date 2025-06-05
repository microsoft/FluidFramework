# Merge Tree Obliterate

This document covers motivation, spec, and design for the upcoming "obliterate" feature of merge-tree.

## Spec

A concise description of merge-tree's current merge conflict resolution strategy is as follows:

-   Insertion of a text segment only conflicts with other insertions at the same location.
    The conflict is resolved by inserting the segment added later nearer in the string.
    For example, from an initial state of "abc", if the operations [insert "hi " at 0] from client 1
    and [insert "bye " at 0] from client 2 are sequenced in that order, the resulting state is "bye hi abc".
-   Range operations (delete, annotate) apply to the range at the time the operation was issued.
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

-   The range specification is resolved at the time the op is sequenced
-   Any subsequent segments inserted into that range concurrently should also be removed

The first clause handles concurrent inserts before the removal is sequenced, and the second clause handles concurrent inserts after the removal is sequenced.

However, there is a way to view obliterate's semantics as a special case of a "move" operation,
which preserves content identity such that concurrently inserted segments will be inserted to the range at its current location.
A main motivator here from the app perspective might be the idea that if user 1 cut and pastes an entire paragraph to a different section of the document
while user 2 edits it, the desired merge outcome would likely be for user 2's edit to apply to the paragraph in its new location.
Roughly, anywhere an application would want obliterate merge semantics on user delete of some content,
the same application would want move semantics if the user instead cut and pasted the content somewhere else.

There have historically been feature requests for move semantics inside merge-tree (for example [issue 8518](https://github.com/microsoft/FluidFramework/issues/8518)),
so it makes sense to do forward-thinking on implementing obliterate in a way that we can extend it to cover move semantics in the future.

For that reason, naming choices of fields and semantics for the remainder of the document will be written in terms of obliterate being the special case
"move this range out of existence".
This should alleviate any back-compat issues if/when we do decide to implement move (esp. fields that end up in ops or snapshots).
The current proposal is to use the runtime value "null" to represent "out of existence", but this choice is flexible.
In prose, for terseness that operation will still be called obliterate.
After describing obliterate's design, this document [digs into how the design can be extended to work for move](##Move).

Notice that the above examples always insert text at positions strictly inside the removed range.
If the insert operation was instead before the "1" or after the "2", one can imagine different applications wanting different behavior:
either the obliterated region should expand to include that text, or it should not.
This topic will be covered in the [endpoint behavior](#endpoint-behavior) section,
but for eventual consistency strategy discussion one should assume that the design should generally support both options
(and either leave it up to merge-tree to restrict degrees of freedom as it seems fit).

## Eventual Consistency Strategy

This section is focused on how one could implement the "obliterate" semantics inside merge tree in an eventually consistent fashion.
This will constitute the bulk of the complexity of the feature.
Since obliterate is generally a "different kind of remove," there may be a nice abstraction to introduce at the code level to generalize
removal information. However, in favor of introducing niceties later this design document will assume fields are inlined and focus on
the strategy for ensuring eventual consistency. If such an abstraction is introduced, ideally it would enable better "pay-to-play" of
common code paths based on merge-tree feature usage.
As an example, `BaseSegment.split()` needs to copy segment properties to the split segment.
So new properties added to segment will unnecessarily copy undefined values.

There are a few aspects of merge tree's bookkeeping and general feature set that require consideration when designing new op semantics:

-   Any changes to direct fields of tree nodes themselves (either new data or changes to bookkeeping of existing data)
-   How the feature interacts with an increasing collab window and zamboni
-   Impact on the partial lengths scheme
-   Bookkeeping and handling of overlapping removals (note some may be obliterates and some may not be)
-   Reconnection
-   Snapshotting impact

We'll first present an overview of a potential scheme for implementing the obliterate op, then comment on these aspects.

### High-level bookkeeping changes

Segments will be augmented with `movedSeq` and `localMovedSeq` fields which generally align with the semantics of `seq, localSeq, removedSeq,` and `localRemovedSeq`.
When segments are moved and not just obliterated, they will also contain a reference to the destination segment.
This may look as follows:

```typescript
/**
 * Tracks information about when and where this segment was moved to.
 *
 * @example
 *
 * Suppose a merge tree had 3 TextSegments "X", "A", and "B", and
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

	/**
	 * List of client IDs that have moved this segment.
	 * The client that actually moved the segment (i.e. whose move op was sequenced first) is stored as the first
	 * client in this list. Other clients in the list have all issued concurrent ops to move the segment.
	 */
	movedClientIds: number[];
}

export interface ISegment extends Partial<IRemovalInfo>, Partial<IMoveInfo> {
	// ...
}
```

The `moveDst` reference position functions as a redirection pointer when another client attempts to concurrently insert into the moved range: the usual approach
for locating a node at some `{ pos, refSeq, clientId }` applies, and if the resulting segment has been moved, one can follow the trail of moves to find the segment's
current location.

Note that though `movedSeq` and `localMovedSeq` act very similarly to `removedSeq` and `localRemovedSeq` when considering the length of a segment at a given
perspective: if the perspective is from after the segment was moved, the tombstone segment should have length 0.
However, these fields need to be independent from `removedSeq` due to the possibility of a removal and a move overlapping, as well as the differences
in how concurrent inserts are handled into a removed or a moved range.

Segment groups will store `ObliterateInfo`, which will hold the references to a start and end position for a given obliterate, in addition to some other bookeeping information relevant to resolving the obliterate on other clients.

```typescript
export interface ObliterateInfo {
	/**
	 * Local references created at the start and end of an obliterated range. Since the end of an obliterate is exclusive, the end reference will be created at the position before the passed-in end position.
	*/
	start: LocalReferencePosition;
	end: LocalReferencePosition;
	/**
	 * The refSeq at which the obliterate occurs.
	*/
	refSeq: number;
	/**
	 * The clientId that performed the obliterate.
	 */
	clientId: number;
	/**
	 * The sequence number at which the obliterate occurs.
	 */
	seq: number;
	/**
	 * The local sequence number, if applicable, at which the obliterate occurs.
	 */
	localSeq: number | undefined;
	/**
	 * The group of segments affected by the obliterate.
	 */
	segmentGroup: SegmentGroup | undefined;
}
```

merge-tree now has a property `Obliterates` that replaces the previous `moveSeqs`, `localMoveSeqs`, and `locallyMovedSegments` structures. This allows for fast referencing of the obliterate operations that were performed in the collab window, as well as accelerated walks to determine which obliterates affect a given segment.

### Remote perspective

We now move to some lower-level implementation details on how to ensure eventual consistency operates correctly in this model.

First, consider the behavior a client must have when processing an obliterate op it didn't submit.
For concreteness and ease of explanation, say this op is `{ seq: 50, refSeq: 40, clientId: 2, op: <move the range [10, 15) to null }`.
The processing client should create local references on the segments `getContainingSegment({ pos: 10, refSeq: 40, clientId: 2 })` and
`getContainingSegment({ pos: 15, refSeq: 40, clientId: 2 })`. It will then mark all segments between these two segments that are alive (i.e. inserted, not removed) from the perspective
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
Excursions were originally used for this job, but the addition of local references for the obliterated start and end points simplifies these checks a great deal.
Concretely, and continuing with the example operations given above, suppose this insertion happens:

```
{ seq: 60, refSeq: 40, clientId: 3, op: <insert "hello" at index 10> }
```
After locating the insertion point and updating the merge tree, we need to decide if the resulting segment is inside of a moved region.
We do this by inserting local references into the merge tree for obliterates within the collab window and storing them in an indexing
structure which supports querying for overlapping obliterates.
Since segments can be compared for ordering in `O(1)` time using their ordinals, this is reasonably efficient provided the collab window is small.

This approach takes care of removed segments as well, since the ordinal of the removed segment will fall in between those of the segments containing the position of the start and end local references. This approach also handles obliterates that should expand - internally, the endpoints are modified based on their `Side` value to be inclusive or exclusive of the adjacent segments.

The logic described above can be found in `MergeTree.blockInsert` (look for `obliterates.findOverlapping`).

This correctly handles inserting a local edit (which should never be immediately obliterated) by ensuring that the most recent obliterate was not performed by the same client that is attempting to insert. It also handles local, unacked obliterates with the manipulation of ob.seq --> normalizedObSeq to compare to the refSeq.
It's worth noting that removals between the obliterated seq and the inserting op's seq don't complicate things much because we're simply checking that the inserting op falls between the segments that start and end the range, regardless of visibility.

If we want to optimize further at some memory cost, it's probably possible to optimize the obliterate index to leverage the tree structure.

### Local perspective

Next, we move to the local handling of a move op while it's in flight.
For consistency with the rest of merge tree's segment state machine, the state transitions of `{ localMovedSeq, movedSeq }` and `{ localRemovedSeq, removedSeq }` should align (`movedSeq` is set to `UnassignedSeqNumber` while the op is in flight, with `localMovedSeq` recording the local seq at which the move happened. Then, on ack of the op, `localMovedSeq` is cleared out and `movedSeq` is replaced with the op's seq).

While a move op is in flight, any non-local insertions into a locally moved range need to be immediately moved to the range's current location
(or removed, if it was obliterated).
This is accomplished by normalizing the remote and local sequence numbers to the same spectrum, as described above.

Segments between the insert location and the local move would have been marked as locally moved when they were inserted into the merge tree and will be counted as between the start and end local references of the obliterate range.

Much of the same logic that goes into conflicting local + remote removal will need to be applied for move.
Nothing stands out as a conceptual issue or hurdle in this realm, though. Just tricky conditionals.

Once the op is acked, the behavior in the [Remote perspective](#remote-perspective) section suffices for any further concurrent segments.

### Other aspects

#### Zamboni

Zamboni will need updating to account for the new bookkeeping fields, but there aren't any conceptual issues in this realm since zamboni cleans up unnecessary data for segments outside of the collaboration window and the only difference between remove and obliterate happens within the collab window.

When a new minimum sequence number is set and zamboni is called, the local references of any obliterates that are no longer in the collab window will be removed.

#### Snapshot

Segments in the snapshot will need to serialize and rehydrate the newly added properties.
Most of the types are plain-old data and JSON.serialize with no issue.
When move is implemented (and so `moveDst` can actually be a local reference rather than undefined), that field will need some special handling.
Several schemes are possible, but in the end it should convert to either a `pos` within some view of the merge-tree or an index+offset into the array
of serialized segments.

#### Reconnection

When a move op is rebased, there will need to be local fixup of the range marked moved locally, since the resulting range may expand with different semantics (different ops
will be concurrent to the rebased version). Since locally applying a move doesn't impact any sequenced segment state (and merge policy is to override pending local moves
with any remote ones just like the remove merge policy), at worst this can be done unperformantly by walking the range, resetting state, and re-applying.

The methods necessary for interpreting where the new range should be in the rebased view of the local merge-tree already exist and are used for regular reconnect (e.g.
to remove a range of content), so should not present additional trouble.

#### Partial Lengths

One key capability of merge-tree is its ability to resolve the information `{ pos, clientId, refSeq }` (and potentially `localSeq` if the local client) into a particular
segment + offset in the merge-tree's leaves.
It does this efficiently by storing indexing structures at each internal node that allow querying for that node's length at any such perspective within the collab window,
then leveraging those structures in an efficient tree walk.

Adding additional tree operations that any client can undertake means that all other clients must be able to reason about their peers' current states.
For example, `movedSeq` and `localMovedSeq` will need to be considered when calculating the length of a node/range from a given perspective.
If the duplicated segment that's inserted as the result of a move is given the `clientId` of the moving client (as opposed to the originating client)
and `seq` of the move operation, generally existing partial lengths logic will work correctly for non-concurrently inserted segments if
`movedSeq` and `localMovedSeq` on the tombstoned segment are interpreted analogously to `removedSeq` and `localRemovedSeq`.
Note that this would require updating the description of the `clientId` field, and for attribution purposes we may want to track the clientId that originally
created the segment separately from the clientId that most recently caused the segment to be where it is (via move).

Things get more complicated when considering resolution of node lengths for concurrently inserted segments.
The remainder of this section assumes the content is obliterated rather than moved; there are additional difficulties for partial lengths when dealing with
overlapping moves not covered in this document (they are probably solvable, but may require changes to the representation of the partial lengths indexing
structure rather than just its data).

Concretely, let's consider how partial lengths might look for a segment concurrently inserted into a moved region.

Suppose:

```
// Initial state at seq 0: "0123456789"
{ seq: 1, refSeq: 0, clientId: 1, op: <move [0, 5) out of existence> }
{ seq: 2, refSeq: 0, clientId: 2, op: <insert "hi" at 2> }
{ seq: 3, refSeq: 0, clientId: 2, op: <insert "hello" at 7> }
```

The desired final state in this case would be "56hello789". After seq 2, client 0 (an observer) has segments that look like so (clientIds that aren't relevant are omitted):

```
[
  { seq: 0, movedSeq: 1, text: "01", movedClientIds: [1] },
  { seq: 2, movedSeq: 1, clientId: 2, text: "hi", movedClientIds: [1] },
  { seq: 0, movedSeq: 1, text: "234", movedClientIds: [1] },
  { seq: 0, text: "56789" }
]
```

If these segments are all in a single block and the minimum sequence number is 0, their parent's partial lengths resembles the following:

```
{
  minLength: 10 // length of "0123456789"
  partialLengths: [{ seq: 1, seglen: -5 }, { seq: 2, seglen: 0 }],
  clientSeqNumbers: [[], [{ seq: 1, seglen: -5 }], /* client 2 */[ ?? ]]
}
```

This data reflects the fact that the subsequence starts at length 10 at seq 0, an observer client sees the length of the subsequence shrink by 5 at seq 1,
and doesn't see the length change afterward (note such a client hasn't yet received seq 3). It also looks correct for resolving client 1's perspective: even if
the refSeq isn't at least 1, `clientSeqNumbers[1]` will still cause the current client's interpretation of client 1's view to include the removal of the
range `[0, 5)`. Client 2 is the tricky one: the length of the block from client 2's perspective should be 12 at refSeq 0, but 5 at either refSeq 1 or 2.
It looks odd, but this can be accomplished by adding a `{ seq: 1 /* comes from movedSeq */, seglen: 2 }` entry to `clientSeqNumbers[2]`.
The intuition is that client 2 counts the length of the segment unless `seq >= movedSeq`, and the method used in partial lengths computes the length of
a subsequence using

(length at min seq) + (any deltas between minSeq and refSeq) + (any deltas for ops submitted by remote client between refSeq and now),

so the last term counts this entry precisely when it's desired.

What happens if the insert and the obliterate are concurrent but sequenced in the other order?

```
// Initial state at seq 0: "0123456789"
{ seq: 1, refSeq: 0, clientId: 2, op: <insert "hi" at 2> }
{ seq: 2, refSeq: 0, clientId: 1, op: <move [0, 5) out of existence> }
{ seq: 3, refSeq: 0, clientId: 2, op: <insert "hello" at 7> }
```

The segment state after seq 2 from client 0's perspective will look mostly the same:

```
[
  { seq: 0, movedSeq: 2, text: "01", movedClientIds: [1] },
  { seq: 1, movedSeq: 2, clientId: 2, text: "hi", movedClientIds: [1] },
  { seq: 0, movedSeq: 2, text: "234", movedClientIds: [1] },
  { seq: 0, text: "56789" }
]
```

And the partial lengths object might look like this:

```
{
  minLength: 10 // length of "0123456789"
  partialLengths: [{ seq: 1, seglen: 2 }, { seq: 2, seglen: -7 }],
  clientSeqNumbers: [[], [{ seq: 1, seglen: 2 }, { seq: 2, seglen: -7 }], /* client 2 */[{ seq: 1, seglen: 2 }]]
}
```

Note that in this case, client 1's `clientSeqNumbers` needed to be fixed up to include an entry for the concurrently inserted segment.
Thus, when an obliterate/move affects a concurrently inserted segment, it's generally possible to modify the generated partial lengths'
`clientSeqNumbers` for the client that sequenced its concurrent op later using the information on the inserted segment to interpret
correct values.

This strategy is also consistent with the existing strategy for overlapping delete: see the following snippet from `addClientSeqNumberFromPartial`:

```typescript
if (partialLength.overlapRemoveClients) {
	partialLength.overlapRemoveClients.map((oc: Property<number, IOverlapClient>) => {
		// Original client entry was handled above
		if (partialLength.clientId !== oc.data.clientId) {
			this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
		}
		return true;
	});
}
```

The other interesting case to go through is when an obliterate/move conflicts with another obliterate/move.

##### Review of overlapping removal

This section illustrates the basic existing handling for overlapping removal.
It can probably be skipped by readers familiar with the scheme, but is here to help the reader determine where assumptions may break down or go wrong
for overlapping obliterate/move.

Overlapping removal of a segment is tracked using the `removedClientIds` field, which is used in partial lengths to add adjustment entries to avoid double-counting
removal.
For example, suppose client 1 and client 2 concurrently remove the range `[0, 5)` and each performs some more ops before acking the others' remove.
That might look something like this:

```
// Initial state at seq 0: "0123456789"
{ seq: 1, refSeq: 0, clientId: 1, op: <remove [0, 5)> }
{ seq: 2, refSeq: 0, clientId: 2, op: <remove [0, 5)> }
{ seq: 3, refSeq: 0, clientId: 2, op: <insert "hi" at 2> }
```

The correct final state is "56hi789". Consider what happens when a listener client (say, client 0) attempts to interpret the insertion of "hi" by client 2.
Before processing, its merge tree segment state would look like so:

```
[
  { seq: 0, removedSeq: 1, removedClientIds: [1, 2], text: "01234" },
  { seq: 0, text: "56789" }
]
```

The constructed partial lengths object for the root of the merge tree would then be:

```
{
  minLength: 10,
  partialLengths: [{ seq: 1, seglen: -5 }],
  clientSeqNumbers: [[], /* client 1 */[{ seq: 1, seglen: -5 }], /* client 2 */[{ seq: 1, seglen: -5 }]]
}
```

Note that client 2's delta applies from seq 1 onward rather than seq 2, since it's constructed using the `seq` and `removedClientIds` on the removed segment.

Client 0 would determine where to insert the op with seq 3 by:

1. Asking the root for its length at `{ clientId: 2, refSeq: 0 }`

-   This calculation is based on (length at min seq) + (any deltas between minSeq and refSeq) + (any deltas for ops submitted by client 2) - (deltas submitted by client 2 before refSeq)
-   From the above bookkeeping, it would compute 10 + 0 + (-5) - 0 = 5

2. Asking for the length of the first child at `{ clientId: 2, refSeq: 0 }`

-   Conditionals here are a bit tedious, but we'd see that clientId 2 is in the segment's removedClientId list, so it has length 0

3. Asking for the length of the second child `{ clientId: 2, refSeq: 0 }`

-   The segment is inserted and not removed, so it has length 5.
    Since the search is looking for an accumulated position of 2, it determines that the correct insertion point is amidst this segment.

##### Overlapping obliterate

The same general strategy used for overlapping removes should be sufficient for tracking overlapping obliteration of segments.
It relies only on information about when and by who a segment was removed, and the main difference between remove and obliterate comes
from which segments they affect rather than how the segments are affected.

Note also that because `movedSeq` is distinct from `removedSeq`, the corresponding partial lengths entry for `movedClientIds[0]` obliterating the segment can be entered
distinctly from the partial lengths entry for `removedClientIds[0]` removing the segment.

Again, the interesting case to check is if two separate clients issue obliterate ops amidst a concurrent insert (otherwise it is functionally identical to the remove case).

```
// Initial state at seq 0: "0123456789"
{ seq: 1, refSeq: 0, clientId: 1, op: <obliterate [0, 5)> }
{ seq: 2, refSeq: 0, clientId: 2, op: <obliterate [0, 5)> }
{ seq: 3, refSeq: 0, clientId: 3, op: <insert "hi" at 2> }
```

The segment state of some observing client after seq 3 is essentially the same as in the non-overlapping example:

```
[
  { seq: 0, movedSeq: 1, text: "01", movedClientIds: [1, 2] },
  { seq: 3, movedSeq: 1, clientId: 3, text: "hi", movedClientIds: [1, 2] },
  { seq: 0, movedSeq: 1, text: "234", movedClientIds: [1, 2] },
  { seq: 0, text: "56789" }
]
```

From the observing client perspective, the interpretation of each client's text if they were to submit an op with refSeq 0 through 3 is as follows:

| refSeq | client 1 | client 2 | client 3 |
| 0 | 56789 | 56789 | 01hi23456789 |
| 1 | 56789 | 56789 | 56789 |
| 1 | 56789 | 56789 | 56789 |
| 1 | 56789 | 56789 | 56789 |

The corresponding lengths table is exactly what's achieved by combining the overlapping remove strategy with the strategy for bookkeeping concurrently inserted segments:

```
{
  minLength: 10,
  partialLengths: [{ seq: 1, seglen: -5 }, { seq: 3, seglen: 0 }],
  clientSeqNumbers: [
    [],
    [{ seq: 1, seglen: -5 }],
    [{ seq: 1, seglen: -5 }], /* comes from adding clientSeqNumber to all entries in removedClientIds */
    [{ seq: 1, seglen: 2 }]   /* comes from the inserted "hi" segment which has movedSeq <= seq */
  ]
}
```

This approach works if the operations are sequenced in the other order or intermediately as well.

## Endpoint Behavior

One important consideration is what happens near the endpoints of the removed range.
There are two general possibilities: either the obliterate expands to include segments inserted
adjacent to the endpoint, or it doesn't.

In the initial implementation, we chose to have the endpoints not expand to include adjacent segments. However, recent feature requests have led to the implementation of
obliterate with endpoint expansion, where concurrently inserted segments adjacent to the obliterate range are also removed. To support this, we have brought the interval concept
of `Side` into merge-tree. See [sequencePlace.ts](https://github.com/microsoft/FluidFramework/blob/de91c3a6b2671e63d624ce60404e7312f111d1ce/packages/dds/merge-tree/src/sequencePlace.ts) for further documentation. The inclusivity of the endpoint depends on the value of `Side` at that position - the endpoint is exclusive if the side is nearer to the current position and inclusive if the side is further from the current position. For example, the start of a range with `Side.After` is exclusive of the character at the position, and would not expand to include content at the start of the range.

The range to obliterate can now specified as a slice range instead of only a set range with plain numbers. This means that obliterate will take in two arguments of type `InteriorSequencePlace`, which specify a position and a side for the start and end of the obliterate range. Based on the side of each endpoint, the obliterate operation will expand to include any segments inserted adjacent to the obliterate range.
For example:
```
// Initial state at seq 0: 0123456789
{ seq: 1, refSeq: 0, clientId: 1, op: <obliterate from { pos: 0, side: Side.Before } to { pos: 5, side: Side.Before }> }
{ seq: 2, refSeq: 0, clientId: 2, op: <insert "A" at 0> }
{ seq: 3, refSeq: 0, clientId: 3, op: <insert "B" at 5> }
// Final state: B56789
```
Since the obliterate range includes segments at position 0 and excludes segments at position 5, the obliterate expands to include the "A" at the start of the range, but does not expand to include the "B" inserted at the end of the range.

## Public API

The public API of sequence will need to be updated for users to leverage the obliterate operation. The most obvious way to extend it would be to align the API shape with
`removeRange`:

```typescript
class SharedSegmentSequence<TInterval extends IInterval> {
	public obliterateRange(start: number | InteriorSequencePlace, end: number | InteriorSequencePlace);
}
```

For context, see [sequencePlace.ts](https://github.com/microsoft/FluidFramework/blob/de91c3a6b2671e63d624ce60404e7312f111d1ce/packages/dds/merge-tree/src/sequencePlace.ts).
Obliterate can still take in number endpoints as well as `InteriorSequencePlace` endpoints with sides specified.

One interesting alternative is to align the public API of sequence with the idea that there are two conceptual kinds of ranges: slice ranges and set ranges (see the next section
for details).
If we did this, we might instead unify `removeRange` and `obliterateRange` into a single method taking in such a range object.
This would have the nice property of naturally extending to annotate operations, if we anticipate wanting to be able to annotate slice ranges.

## Move

There are several different possible options for defining merge outcomes for the "move" operation.
The upcoming SharedTree DDS has done a lot of thinking in this area and landed on a relatively simple set of semantics that give reasonable
outcomes in most cases (see [issue 9658](https://github.com/microsoft/FluidFramework/issues/9658) for some very detailed reading).

These semantics are implementable in merge-tree, are compatible with feature requests for obliterate, and generally seem like a good direction to take
that we can later extend if applications request.

There are a few primitive concepts that all of the merge outcomes depend on.

First, a sequence of length `N` is conceptualized as an interleaving set of `N+1` _gaps_ and `N` nodes.
Nodes in the sequence may move, but the gaps between the nodes do not.

Insertion into the sequence is performed by specifying a gap to insert in as well as a direction that the inserted content prefers to tend toward
in case other content is inserted/moved concurrently into the same gap.

> Merge-tree already conceptualizes insert locations similarly: it names the gaps `0` through `N`. It does not permit app-level specification of concurrent merges,
> but that degree of freedom doesn't need to be exposed.

Next, there are two types of range specifications: _set ranges_ and _slice ranges_.

A _set range_ targets exactly the objects in a given range at the time it was specified. In merge-tree terms, the segments that the range affects are
resolved from the perspective of the submitting client at its refSeq, and only those segments undergo whatever operation applies (move, annotate, remove).

> Merge-tree's `remove` operation has set range semantics, since it doesn't cause removal of any concurrently inserted segments.
> It's worth noting that a move operation with set range semantics is conceivable inside this framework, and not something merge-tree currently implements.
> E.g., if the set range "CDE" inside a string "ABCDEF" was moved to the end of the string, and someone concurrently moved "B" and "C" to the start,
> the string may end up "BAFCDE" or "BCAFDE" depending on the sequencing order of the moves.

Finally, a _slice range_ specifies a start location and an end location, where a location has the same object shape as an insert destination: a gap plus a merge direction.
The range of nodes that the operation affects is interpreted at the time the operation applies, and any concurrent insertions/moves of content _into_ that range
are also affected. The merge direction should be interpreted as relative to a "phantom segment" in the gap specifying the slice endpoint.
For example, in the string "ABCDE", the slice range
`[{ pos: 0, merge: <concurrent segments merge nearer> }, { pos: 3, merge: <concurrent segments merge further> })` referring to "ABC" would
not expand at either endpoint whereas if the merge options were flipped, it would expand at both endpoints.

> These semantics align with the proposed merge-tree `move` operation. Like insert, we can fix the direction things should merge
> (in this case it instead affects which way the move "expands") if consumers don't need the extra degrees of freedom.

Notice that because gaps don't move, this set of outcomes doesn't suffer from problems like a range specification becoming invalid (which happens with
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
Then client 2's op has a start endpoint targeting a tombstoned segment for paragraph 3, so it only affects paragraph 4.
The final state is "15423" since merge-tree chose near-merge-later.

If the ops are sequenced in the other order, the final state would instead be "15234".

Both of these outcomes are again generally plausible.
