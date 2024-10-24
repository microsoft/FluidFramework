Merge-tree is a distributed, low-latency B+ tree used to implement real-time collaborative editing of sequences, strings, and matrices.

This is an entry-level explanation of the core architecture and algorithms backing the merge-tree data structure and is the sort of explanation I would have wanted in my first 3 months of working on it. The goal of this document is that someone with no context on collaborative editing can be able to reason about the code at a high level.

This document only describes the core merge-tree algorithms and does not touch on the ancillary algorithms that are necessary for the merge-tree to function, but which do not live inside the merge-tree itself. This includes problems like persistence, real-time communication, algorithms built on top of merge-tree such as those specific to strings or matrices, and some server-side functionality that will be discussed later.

Although in theory a merge-tree need not operate on text, I find it easiest to reason about the core algorithms in the context of text editing, and so much of the higher-level explanation will center around that.

#### Overview

At its simplest, a merge-tree defines the following operations:

1. `insert(index: number, text: string)`
2. `removeRange(start: number, end: number)`
3. `annotateRange(start: number, end: number, properties: object)`

You can insert text, remove a range of text, or give a key-value property to a range of text. 

The API of the merge-tree is based around these operations. These can be thought of as JSON payloads containing the above function parameters. For example, `{ type: "insert", index: 0, text: "foo" }`.

In addition to these parameters, each operation ("**op**") has a **sequence number** associated with it, abbreviated "seq". This is a [strictly increasing] integer that (simplifying a bit)[^1] is unique to a given operation. The sequence number determines the order in which operations get applied. That is, the operation at seq n _must_ be processed before the op at seq n+1. 

If you are familiar with [sequence numbers in the context of network protocols like TCP], this is very similar.

The exact machinery for sequencing ops lives outside of merge-tree and is not necessary for understanding the core algorithms. 

If we look at a simplified example of an op stream:

```json
[
    { "type": "insert", "index": 0, "text": "hello", "seq": 1 },
    { "type": "remove", "start": 1, "end": 5, "seq": 2 },
    { "type": "insert", "index": 1, "text": "i", "seq": 3 },
]
```

Here, we have a sequence of ops that constructs the following string:

seq 1: "hello" (insert string "hello")  
seq 2: "h" (remove range `[1-5)`)  
seq 3: "hi" (insert string "i")  

This is relatively straightforward behavior to reason about, and should be roughly what you would expect to see from a regular string data structure used for normal text editing.

The complexity of merge-tree comes from its support for collaboration. In order to talk about collaboration, we have to add 2 more fields to our ops: **client id** (`clientId`) and **reference sequence number** (`refSeq`).

The clientId is exactly what it sounds like: a unique identifier for a particular user in a collaboration session. If three people are editing a document in their browser at the same time, each user would be given a unique clientId. In practice these are UUIDs, though merge-tree has some optimizations that convert the UUIDs to small integers by [interning] them.

The reference sequence number is slightly more complex, and will require a bit more background to fully describe.

In general, collaboration looks something like this:

One user, or client, will create an op and send it to the server. The server will process the op and assign it a sequence number. For the client that sent the op, the server will acknowledge the op and send that client back a sequence number. For the other clients, it will send them this op with the sequence number attached.

All clients then process this op and update their refSeq. The refSeq is the sequence number of the last operation that a particular client processed from the server.

When I first started working on merge-tree, I had the misconception that two ops were submitted concurrently if they had the same sequence number, but they are actually concurrent if both ops have a refSeq below the sequence number of the other.

Let's take a look at a simple example with two clients:

We'll start with the string "abc". We have two clients, "A" and "B". Both clients insert a single character at position 1 at the same time, without knowing about the existence of the other.

Here's what our op stream might look like.

```ts
[
    { seq: 1, refSeq: 0, clientId: "A", type: "insert", text: "X", index: 1 },
    { seq: 2, refSeq: 0, clientId: "B", type: "insert", text: "Y", index: 1 },
]
```

Our string would look like this:

start: "abc"  
seq 1: "aXbc"  
seq 2: "aYXbc"  

Note that the refSeq of the two ops is the same. This means that the two operations occurred without either client being aware of the other. The sequence number on client A's op is lower than client B's op. This means that client A's op likely reached the server before client B's, though this does not imply anything about the time that either op occurred. It's also worth mentioning that even if the two ops _had_ reached the server in the exact same nanosecond, they would still have different sequence numbers.

Because neither op was aware of the other, we would consider them to be concurrent.

The scenario above looks like this in prose:

When the server processes the op from client A, it sends back to client A the sequence number "1". It then sends to client B the op from client A.

On receiving the sequence number from the server, client A updates its refSeq to be 1.

Before client A's op has been sent to client B, client B sends its own op to the server. Client B receives client A's op and updates its refSeq to 1.

The server does the same thing for client B's op, and both client A and client B update their refSeq to 2. 

This should hopefully start to make a bit of sense, but will become clearer once we talk about the internal representation of the merge-tree and go a bit more in depth on collaboration.

#### Internal Structure

Merge-tree represents a sequence as an ordered series of segments, with individual characters or elements being identified by the combination of a segment index and a character offset into that segment, referred to as "segoff." For example, if we take the string "abcde" and split it into arbitrary segments:

```ts
["a", "bcd", "e"]
```

The character "c" in the above string is at segment 1, offset 1. The character "e" is at segment 2, offset 0.

When the endpoints of an operation (like insertion or removal) fall within a segment, that segment is split. For example:

```ts
["ae"] -> insert "bcd" at position 1 -> ["a", "bcd", "e"]
["abcde"] -> remove the range [1, 4] -> ["a", "bcd", "e"] -> ["a", "e"]
```

In order to map a numeric character position to a segoff, the merge-tree traverses the list of segments summing up the length of each segment until it lands inside one. Naively this list of segments can be modeled by a 2d-array, but in practice we represent this as a tree-like structure to efficiently traverse over large sections of the tree at once.

If we return back to the `["a", "bcd", "e"]` example, to get the segoff of the character at position 4 ("e"), we traverse the list of segments until we reach a segment that causes our cumulative length to exceed our position. 

First we see "a" with a length of 1. Then we see "bcd" with a length of 3. Our cumulative length so far being 4. Because our characters are 0-indexed, we're actually looking for the character which causes length to become 5. So we resolve the character position 4 to the segoff `{ segment: "e", offset: 0 }`.

To get the full length of the string, we would traverse all segments like above, summing up their lengths.

#### Adding Basic Collaboration

So far we haven't really motivated the reasons behind this array-of-segments structure. To do so, we have to make the segments more useful by adding more bookkeeping.

Merge-tree is able to simultaneously represent multiple different states by changing the visibility of segments. In practice, queries like "what is the character in this string at position 3" and "what is the full text of this string" are parameterized by both clientId and refSeq. These two parameters allow us to change the visibility of segments, and therefore see what the string would have looked like from the perspective of different clients at different points in time.

All segments have a `seq` property, which is the sequence number at which they were inserted. Segments also have a `removedSeq`, an optional sequence number denoting if and when the segment was removed.

Likewise, all segments have a `clientId` and `removedClientId` property, which denote the client that either inserted or removed the segment respectively.

Using these properties, and the properties from the op, the merge-tree can determine whether a given op would have been able to see a given segment.

The algorithm is this:

When processing a remote op -- i.e. an operation from another client -- that op is able to see all previous operations submitted by that remote client. That is, if `op.clientId === segment.clientId`, then the segment is visible to that operation during traversal.

Operations are also able to see all other operations that occurred before or at their refSeq. In code, we would say that all segments with `op.refSeq >= segment.seq` are visible.

The same is also true for `removedSeq` and `removedClientId`. If `op.clientId === segment.removedClientId`, then the segment is not visible, because it has been removed from the perspective of that client. Likewise all segments in which `op.refSeq > segment.removedSeq` are not visible during traversal.

This behavior is extremely powerful and is the basis for all conflict resolution and collaboration within merge-tree.

Let's look at an example merge-tree written out as json:

```json
[
    {
        "seq": 1,
        "content": "ab",
        "clientId": "A"
    },
    {
        "seq": 3,
        "content": "cd",
        "clientId": "B"
    },
    {
        "seq": 2,
        "content": "e",
        "clientId": "A"
    }
]
```

This is the string "abcde" with segments `["ab", "cd", "e"]`. Let's say at this point all clients ("A" and "B") have a refSeq of 3 and that the current seq is also 3.

If client A then inserts the character "X" at position 3, we get the string "abcXde" with segments `["ab", "c", "X", "d", "e"]`. Our segment "X" looks like:

```json
{
    "seq": 4,
    "content": "X",
    "clientId": "A"
}
```

What would happen, though, if client B were to delete the character at position 4 ("d") concurrent to client A inserting the character "X"?

Let's say that the deletion operation reaches the server after the insertion operation. The insertion has seq of 4 and the deletion has seq of 5.

We'd like for our resulting string to be "abcXe". The character "X" was inserted between the "c" and the "d" from the perspective of client A, and the character "d" was deleted from the perspective of client B. When we combine these two operations, we want to keep "X" in relatively the same position and delete the same character ("d").

Our deletion op looks like this:

```json
{
    "op": "remove",
    "seq": 5,
    "refSeq": 3,
    "start": 3,
    "end": 4, // (range end is exclusive, so does not include the character at position 4)
    "clientId": "B"
}
```

I'll walk through an example of the algorithms I've described so far.

To start removing segments, we need to find which segments fall within the bounds of the remove, [3, 4). If either of those endpoints fall within a segment, that segment must be split. After splitting, we can do a depth-first tree traversal to find the start segment and then continue traversing until we reach the end segment. 

Like before, we walk the segments summing up their length to determine when we reach a given position. In this case, we're looking for a start of 3 and an (exclusive) end of 4.

Again, our string consists of the segments `["ab", "c", "X", "d", "e"]`. We start with the segment "ab". This segment was inserted at seq 1, which is below our refSeq. It also has no removedSeq. This means that our deletion op knew about this segment, and so it is visible to us.

We can add its length of 2 to our running total. The next segment is "c", which has the same behavior and we can add its length of 1.

The next segment is "X", which was inserted by client A at seq 4. With a seq of 4, it was inserted after the refSeq (which is 3) of our remove op. This means the remove op is unaware of this segment, so we can skip it during this traversal. 

The next segment is "d". This segment _is_ visible to the deletion op, and adding its length to our running total puts us over the start position. Now we have our start segment and we can continue traversing the tree until we reach our end position.

In this case, that's pretty simple. We only have one segment to delete. 

We can mark this segment removed by setting its removedSeq and removedClientId to the seq and client id of the op, 5 and "B" respectively. 

All merge-tree ops follow this same pattern: find the position of an index in the tree and update some bookkeeping. In the case of remove and annotate, we change the properties of all the segments in a given range. In the case of insertion, we go to the insertion index, split the segment at that index if necessary, and do a tree insertion.

#### Local Edits

If the merge-tree had to wait for an ack from the server every time it made a change, users would more than likely see very high latency between the op for the change being sent and the change being represented in the merge-tree. Especially in the case of multiple users editing the same merge-tree at once, seeing the results of a single edit might mean we need to process 100 ops from other clients before getting to our own.

The solution to this is to allow **un-acked** edits to the merge-tree which are used to create a local state that can be edited immediately and then reaffirmed once we receive an ack from the server.

To support local edits, the merge-tree needs additional bookkeeping to keep track of local-only changes. This comes firstly in the form of a **local sequence number** (localSeq). Much like a regular sequence number, this is a strictly increasing integer that uniquely identifies an operation; however, unlike a regular sequence number, a localSeq is unique to each client and lives completely in memory. localSeqs are not persisted anywhere, and exist only to manage the ephemeral state of local changes before they are **acked**.

Making use of this new local sequence number, segments contain additional bookkeeping the form of localSeq and localRemovedSeq. These are the local sequence numbers at which a segment was inserted or deleted respectively. If a segment has a local sequence number set, the corresponding _sequence number_ is set to a sentinel value of -1. We call this special value the **unassigned sequence number**.

So if a segment has been removed, but that removal is yet unacked, that segment would have a removedSeq of -1 and a localRemovedSeq of whatever the localSeq was at the time of the op. 

On ack, we are given a proper sequence number for a given local op. We must then traverse the merge-tree to find all the segments which have a local seq and convert their local seq to a proper sequence number. This would mean in our above example, setting the localRemovedSeq to `undefined` and setting the removedSeq of the sequence number we got back from the server.

In practice the merge-tree does additional bookkeeping to associate segments with local ops so that it does not need to traverse the entire tree to identify segments associated with a localSeq, but rather can just look the segments up in a dictionary and modify them all at once.

#### Reconnect and Rebasing

Sometimes users go offline but continue making edits. In this scenario, if the user comes back online we don't want to just throw away all the changes a user made while they were disconnected.

The solution for this in merge-tree is to rebase and resubmit all the operations that were created while offline. "Rebase" here is much like the rebasing you may be familiar with in git. We must first apply all the operations that were submitted by other clients while disconnected, updating the ops _we_ submitted while doing so. Then, once these ops have been processed, we can resubmit our ops and hopefully preserve the offline changes.

#### Zamboni

Over time, the merge-tree gets filled with a lot of cruft. This comes in two forms: tombstoned segments and fragmentation.

Removed segments are not immediately deleted from the merge-tree, but rather marked as removed and live in the tree as tombstones. In long running collaboration sessions, merge-trees can very easily end up with lots of superfluous tombstoned segments.

On terminology: here we use "removed" to mean deleted from the string from the perspective of the user, i.e. a segment is not visible, and "deleted" to mean that the segment is not in the string at all.

The other sort of cruft is inefficient segmentation or "fragmentation." This is where we use more segments than is necessary to represent a given string, for example `["a", "b", "c"]` vs `["abc"]`. Over time the merge-tree tends towards this more-segmented structure as more and more ops split the segments. Superfluous segments increase memory usage and the time it takes to walk the tree, as there are more segments to traverse.

During normal operation, the merge-tree needs these tombstoned and split segments to properly function, but there _is_ a point in which this information becomes superfluous. Once all collaborating clients have seen a given insertion or deletion, we can safely delete a tombstoned segment or combine adjacent segments.

This process of cleaning up — or "garbage collecting" — the merge-tree is called **zamboni**. In real life, Zambonis clean the top layer of ice on an ice rink. Merge-tree has a similar process here where it cleans up the top (bottom?) layer of its segments incrementally.

This leads us into two concepts: the **minimum sequence number** (minSeq) and the **collab(oration) window**. The minimum sequence number is how merge-tree is able to know that all clients have seen a given change and represents the minimum of the refSeq of all the participating clients. The collab window is defined in terms of the minSeq, and refers to all the ops that occurred between the minSeq and the current highest sequence number from the server.

The minSeq is not tracked directly by the merge-tree, and is an implementation detail of the environment in which it runs.

When the server tells the merge-tree that the minSeq has advanced, it is free to do cleanup of these tombstoned and split segments.

The merge-tree keeps track of segments that need cleanup in a min-heap. For every operation (e.g. insert, remove, annotate), the merge-tree inserts into this min-heap the segments affected by that operation, keyed by the sequence number of that operation.

When the minSeq advances, the merge-tree is able to pop segments off of this heap to determine whether they are eligible for zamboni cleanup. If a segment was removed before the minSeq (in other words "outside the collab window"), then it can be safely deleted from the tree. Otherwise, if the segment was _inserted_ prior to the minSeq, it can be safely combined with adjacent segments, assuming those segments have identical properties.

The concepts of a minSeq and collab window are a large part of what makes merge-tree both novel and efficient. Other, more-academic text editing algorithms rely on having the full edit history of the document persisted forever, while merge-tree is able to only keep exactly what is necessary.

There is a small caveat today that zamboni is less effective (perhaps aggressive is a better word) than it could be. The above algorithm also runs during [summarization](#summarization), though during summarization we run a much more aggressive algorithm, essentially settling on the optimal representation of a given merge-tree. Zamboni runs progressively as the minSeq updates and does not always produce the most optimal representation.

It should also be noted that the size (number of ops) of the collab window has a big impact on the performance of the merge-tree. Not only does a large collab window result in a lot of cruft that is unable to be cleaned up, there are a number of merge-tree algorithms that are O($$n^2$$) relative to the size of the collab window. Partial lengths updating, which we discuss below, is an example of such an algorithm.

#### Partial Lengths

**Partial lengths** are an optimization for quickly and efficiently calculating range length queries. Where a merge-tree is like a B+ tree that can represent many states simultaneously, I like to think of partial lengths as a similar structure based on [segment trees].

Just like the merge-tree can answer queries like "what did the text of the string look like for this user at this point in time," partial lengths can answer queries like "what was the _length of this segment_ for this user at this point in time?"

The goal for this data structure is to efficiently return the sum of the length of the child nodes given a refSeq and client id. By using partial lengths we can quickly skip over large sections of the tree by calculating their length from the perspective of our current operation.

Recall our example tree traversal above where we sum up segment lengths to reach our desired position. Partial lengths is the structure that allows us to speed up this traversal from O($$n$$) to O($$log n$$). This makes partial lengths critical to the efficient use of the merge-tree data structure.

#### Markers

Merge-trees are not limited to working with text, and can support any kind of user-defined segment.

**Markers** are a first-class segment with special behavior implemented by the merge-tree. They are 1-length segments that support accelerated queries for finding the next adjacent marker. Markers are most useful in text editing, where they make it easy to, for example, find the start of the next paragraph or next cell in a table.

This acceleration is implemented by keeping a sort of doubly linked list-like data structure with pointers stored on each parent node. Parent nodes are able to navigate to the left or right to find the next adjacent marker(s).

In the code today, this behavior is more generic than just applying to markers, with segments having this behavior being called "**tiles**." In practice, this behavior only applies to markers as of writing.

#### Reference Positions

Reference positions are similar to having pointers to individual characters in a string. As the contents of the string change, and the integer position of the character shifts around, the reference position will always point to the same character.

If that character is deleted, certain kinds of reference positions can slide to the next closest candidate character.

Reference positions are used to implement intervals, with the start and end positions of an interval being reference positions.

There is quite a bit of [existing writing about reference positions], so I will not talk too much about the different reference types or the core algorithms here.

##### Local Reference Positions

The concept of a reference position is an abstract interface that could in theory be implemented by a number of different structures to achieve myriad functionality.

In practice, there is only one kind of reference position[^2]: a local reference position. Local reference positions are not sent across the wire and there is no op for creating one. They are purely local to the current client and are not persisted at any point.

"Local reference position" and "reference position" are today used interchangeably. The document linked in the section above discusses the behavior of local reference positions in more depth.

For use in intervals, the interval collection manages sending the position of local references to other clients and recreating such references locally when changes are received from other clients.

#### Ordinals

Sometimes it's useful to be able to compare two segments and quickly determine the ordering of their position in the tree. For example, if you have a list of random segments and want to quickly sort them by their position in the tree.

The merge-tree attaches an "ordinal" to each segment. This is a unique string that is used in the ordering of segments. Ordinals can be thought of as arrays of bytes, though in practice we represent them as strings because [comparison of arrays is hard in JavaScript].

At each level of the tree we add a new byte to the array. Within a given level, the last byte increases as we move along the tree.

For example:

```
     "0"
  /       \
"00"      "01"
       /   |   \
   "010" "011" "012"
```

It's a bit annoying to get the ASCII diagram to look nice, but this should give a basic idea. Here, the nodes are what the ordinals would be at each segment. Then to compare if segment A comes in the string before segment B, we just have to compare `A.ordinal < B.ordinal`.

#### Summarization

**Summarization** is the process by which the merge-tree is serialized so that it can be loaded later. 

A lot of the summarization process can be considered an implementation detail best understood by reading the code, but I do wish to touch on a few interesting bits that aren't documented anywhere else, are useful to know, and are likely to remain true for some time.

Today the merge-tree supports two summarization formats: legacy and v1. The difference between the two is largely in the way operations that live inside the collab window are persisted.

The "legacy" format persists these ops literally and on load re-applies them. The v1 format eagerly applies these ops and persists the tree with them applied.

In the legacy format, the merge-tree will collect all the operations that occurred in the collab window (i.e. above the minSeq) and store them separately in an array called "catch up ops". All changes to segments that occurred past the minSeq are not persisted in this format. On load, these catch up ops are re-applied to the tree to get to the state at summarization.

In the v1 format, there is no such concept, and all segments are serialized exactly as they are in the tree at the point of summarization.

The SharedString data structure makes use of the "legacy" format, while the SharedMatrix data structure makes use of the v1 format.

There isn't a large reason to prefer one format over the other, and the distinction is largely for legacy reasons. Although one format is called "legacy," both formats are in active use and are supported -- the "legacy" name is a bit of a misnomer.

#### Aside: What is a B-tree?

B-trees and B+trees are admittedly more-niche data structures, so I think it may be helpful to quickly describe what they are. That the merge-tree is a B+tree is very much an implementation detail, and so it is not critical to understand these algorithms, but it may make some of the inner workings more clear.

You are likely already familiar with a BST or binary search tree. This is a tree data structure in which at each node values lesser than that node can be found by taking the left branch and values greater than the node can be found to the right.

A B-tree is exactly this data structure, except at each node instead of a single value, it contains a sorted array of values. This reduces the height of the tree, the number of unique allocations required, and improves the cache coherence of search and lookup.

A B+tree is a B-tree that does not store values in non-leaf nodes. So in a B+tree, all the elements in non-leaf nodes are pointers to other nodes. In a B-tree, the pointers to other nodes and values may be mixed in the node.

So merge-tree is a binary search tree where at each node there is either an array of pointers to child nodes, or in the case of leaf nodes there is an array of segments, as we described above.

#### Review and Glossary

The below is a quick summary of the vocabulary terms which are discussed in more detail above.

**sequence number**: a strictly increasing integer assigned uniquely to all operations in the order they're processed by the server  
  
**refSeq**: the last sequence number from the server a particular client processed  
  
**minSeq**: the lowest reference sequence number (refSeq) of all clients viewing a document  
  
**current seq**: the highest (most recent) sequence number processed by the server  
  
**collab window**: all ops and sequence numbers between the minSeq and the current seq  
  
**localSeq**: a strictly increasing integer assigned uniquely to all _local_ operations in the order they are created. is not sent over the wire or persisted anywhere  
  
**unassigned sequence number**: the placeholder/sentinel sequence number used for local edits when they have not been acked by the server, and so lack a proper sequence number  
  
**ordinal**: a string of bytes used to quickly determine relative ordering of two or more segments  
  
**reference position**: a pointer to an individual character in the string. slides to other characters if the character it points to is removed  
  
**partial lengths**: a segment tree-like optimization for quickly computing the length of nodes/segments in the merge-tree  
  
**zamboni**: merge-tree's garbage collection algorithm  
  
**marker**: special-cased 1-length segment that has no content itself and supports efficiently finding other markers  
  
**tile**: any segment having the spatially accelerated behavior of markers  
  
**acked**: an operation which has been sent to the server and given a sequence number  
  
**unacked**: an operation which has not yet been given a sequence number by the server  
  
**client sequence number**: a per-client sequence number used by the server to ensure data integrity and that all ops are processed in order. unused by merge-tree
  
[interning]: https://en.wikipedia.org/wiki/String_interning
[comparison of arrays is hard in JavaScript]: https://stackoverflow.com/questions/8328908/javascript-surprising-array-comparison
[strictly increasing]: https://akuli.github.io/math-derivations/eqs-and-funcs/incdec-funcs.html
[sequence numbers in the context of network protocols like TCP]: https://gunkies.org/wiki/Sequence_number
[existing writing about reference positions]: https://github.com/microsoft/FluidFramework/blob/7621baec8ef1ca0436d3429e5714317a281a40a7/packages/dds/merge-tree/docs/REFERENCEPOSITIONS.md
[segment trees]: https://cp-algorithms.com/data_structures/segment_tree.html

[^1]: Technically sequence numbers of two ops _can_ be the same in the case of grouped batching and grouped ops in general, but I think it's helpful to ignore these cases when discussing the core algorithms.  

[^2]: [Markers](#markers) technically also implement the `ReferencePosition` interface, but this is largely legacy cruft and this functionality is not widely used today by merge-tree or its consumers.  
