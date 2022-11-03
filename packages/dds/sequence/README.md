# @fluidframework/sequence

The **@fluidframework/sequence** package supports distributed data structures which are list-like.
Its main export is [SharedString][], a DDS for storing and simultaneously editing a sequence of text.

Note that SharedString is a sequence DDS but it has additional specialized features and behaviors for working with text.

This package historically contained several other sequence-based DDSes, but because they have unintuitive behaviors,
they are deprecated and being moved to the *experimental* folder.

The main reason for this is the lack of *move* semantics within the sequence, which becomes crucial when dealing with sequences of
complex content.
For that reason, all of the examples in this README use `SharedString`. However, the APIs discussed are available on the common base class: `SharedSegmentSequence`.

For the remainder of this document, the term *sequence* will refer to this base class.

*Item*s are the individual units that are stored within the sequence (e.g. in a SharedString, the items are characters),
but regardless of the type of data stored in the sequence, every item in a sequence is at a specific *position* starting
at 0, similar to an array. However, sequences differ from arrays in that the positions can move as local and remote
editors make modifications to the sequence.

As its name suggests, SharedSegmentSequence is composed of *segments*. Segments are the unit that the sequence works
with internally, and contain items within them. Thus, every segment has a length of at least 1 -- that is, it contains
at least one item -- and segments may be split and merged arbitrarily as the sequence is edited. This means the length
of the sequence is not the number of segments, but rather the sum of the length of all the segments.

For example, consider a SharedString that is initially empty. User A adds the characters a, b, and c to the
sequence. Its length is now 3 -- it contains 3 items. Internally, however, the sequence could have either 1, 2, or 3
segments.

```bash
Segments: [S1] [S2] [S3]
   Items:  a    b    c

Segments: [  S1  ]  [S2]
   Items:  a    b    c

Segments: [    S1     ]
   Items:  a    b    c
```

In typical use, the splitting and merging of segments is an implementation detail that is not relevant to using the
sequence. However, it is possible to enumerate the segments that intersect a range of positions for performance reasons.
In this case it is important to not retain references to the segments (outside of the enumeration), and to make no
assumptions based on the length of the segments themselves.

<!-- When talking about positions in a sequence we use the terms *near*, and *far*. The nearest position in a sequence is 0,
and the farthest position is its length. When comparing two positions the nearer position is closer to 0, and the
farther position is closer to the length. -->

## Using a Sequence

Sequences support three basic operations: insert, remove, and annotate.
Insert and remove are used to add and remove items from the sequence, while annotate is used to add metadata to items.
Notably, sequences do not support a notion of "moving" a range of content.

If "move" semantics are a hard requirement for your scenario, [this github issue](https://github.com/microsoft/FluidFramework/issues/8518) outlines some reasonable alternatives.

### Insert

Insert operations on the sequence take a single position argument along with the content. This position is inclusive and
can be any position in the sequence including 0, to insert at the beginning of the sequence, and the length of the
sequence, to insert at the end.

```typescript
    //   content:
    // positions:

    // insert text at position 0
    sharedString.insertText(0, "hi");
    //   content: hi
    // positions: 01

    // insert text at the end position
    sharedString.insertText(
        sharedString.getLength(),
        "!");
    //   content: hi!
    // positions: 012

    // insert text at position 2
    sharedString.insertText(
        2,
        " world");
    //   content: hi world!
    // positions: 012345678
```

### Remove

Remove operations take a start and an end position, referred to as a *range*. The start position is inclusive and can be
any position in the sequence from 0 to its `length - 1`. The start position cannot be the length of the sequence like it
can in insert, because there is nothing at that position. The end position is exclusive and must be greater than the
start, so it can be any value from 1 to *n* (where *n* is the length of the sequence).

```typescript
    //   content: hi world!
    // positions: 012345678

    // remove the first 3 characters
    sharedString.removeRange(0, 3);
    //   content: world!
    // positions: 012345

    // remove all the characters
    sharedString.removeRange(0, sharedString.getLength());
    //   content:
    // positions:
```

### Annotate

Annotate operations can add or remove map-like properties to or from items in the sequence. They can store any JSON
serializable data and have the same merge behavior as a [SharedMap][] (last writer wins). Annotate takes a start and end
position which work the same way as the start and end of the remove operation. In addition to start and end, annotate
also takes a map-like properties object. Each key of the provided properties object will be set on each position of the
specified range. Setting a property key to null will remove that property from the positions in the range.

```typescript
    //   content: hi world
    // positions: 01234567

    let props1 = sharedString.getPropertiesAtPosition(1);
    let props5 = sharedString.getPropertiesAtPosition(5);
    // props1 = {}
    // props5 = {}

    // set property called weight on positions 0 and 1
    sharedString.annotateRange(0, 2, { weight: 5 });
    props1 = sharedString.getPropertiesAtPosition(1);
    props5 = sharedString.getPropertiesAtPosition(5);
    // props1 = { weight: 5 }
    // props5 = {}

    // set property called decoration on all positions
    sharedString.annotateRange(
        0,
        sharedString.getLength(),
        { decoration: "underline" });
    props1 = sharedString.getPropertiesAtPosition(1);
    props5 = sharedString.getPropertiesAtPosition(5);
    // props1 = { weight: 5, decoration: "underline" }
    // props5 = { decoration: "underline" }

    // remove property called weight on all positions
    sharedString.annotateRange(
        0,
        sharedString.getLength(),
        { weight: null });
    props1 = sharedString.getPropertiesAtPosition(1);
    props5 = sharedString.getPropertiesAtPosition(5);
    // props1 = { decoration: "underline" }
    // props5 = { decoration: "underline" }
```

### Sequence delta event

Whenever an operation is performed on a sequence a *sequenceDelta* event will be raised. This event provides the ranges
affected by the operation, the type of the operation, and the properties that were changed by the operation.

```typescript
sharedString.on("sequenceDelta", ({ deltaOperation, ranges, isLocal }) => {
    if (isLocal) {
        // undo-redo implementations frequently will only concern themselves with local ops: only operations submitted
        // by the local client should be undoable by the current user
        addOperationToUndoStack(deltaOperation, ranges);
    }

    if (deltaOperation === MergeTreeDeltaType.INSERT) {
        syncInsertSegmentToModel(deltaOperation, ranges);
    }

    // realistic app code would likely handle the other deltaOperation types as well here.
});
```

Internally, the sequence package depends on `@fluidframework/merge-tree`, and also raises `MergeTreeMaintenance` events on that tree as *maintenance* events.
These events don't correspond directly to APIs invoked on a sequence DDS, but may be useful for advanced users.

Both sequenceDelta and maintenance events are commonly used to synchronize or invalidate a view an application might have over a backing sequence DDS.

## Sequence merge strategy

The Fluid sequence data structures are eventually consistent, which means all editors will end up in the same
final state. However, the intermediate states seen by each collaborator may not be seen by other collaborators. These
intermediate states occur when two or more collaborators modify the same position in the sequence which results in a
conflict.

### Merge strategy for insert

Consider a sequence like this:

```bash
    //   content: hi mar
    // positions: 012345
```

Now two users simultaneously insert characters at the end of the sequence. One inserts `k` and the other inserts a `c`.
This is an *insert conflict*. The basic strategy for insert conflict resolution in the sequence is to merge *far*,
closer to the end of the sequence.

This merge strategy is possible because of a fundamental property of the Fluid Framework, which is guaranteed ordering.
That is, while the two inserts occurred simultaneously, the operations will be given a global order and all clients will
see the order of the operations when applying them locally. This enables each client to converge to the same state
eventually.

In the earlier example, assuming the `k` operation was ordered before the `c` operation, then the `k` would be
inserted at position 6 first. Then the `c` op is applied -- this is the merge conflict. The `c` op is inserted at the
position requested (6), and the `k` is pushed out towards the end of the sequence.

```bash
    //   content: hi mar
    // positions: 012345

    // insert(6, "k")
    // k op is ordered first
    //   content: hi mark
    // positions: 0123456

    // insert(6, "c")
    // c op is now applied, pushing the k towards the end of the sequence
    //   content: hi marck
    // positions: 01234567

```

This same logic applies if multiple items are inserted at the same position -- the earlier ordered items will be pushed
towards the end of the sequence as the later items are merged.

### Merge strategies for remove

Like insert, the strategies for remove and annotate also use the guaranteed ordering provided by the Fluid Framework.
Consider again the example from above. Now one user inserts a `y` at position 6, and another user removes the `c` and
the `k` (positions 6 and 7).

```bash
    //   content: hi marck
    // positions: 01234567

    // REMOVE BEFORE INSERT
    // remove(6, 7)
    // remove op now applied
    //   content: hi mar
    // positions: 012345

    // insert(6, "y")
    // no merge conflict -- position 6 is empty
    //   content: hi mary
    // positions: 0123456

    // OR

    // INSERT BEFORE REMOVE
    // insert(6, "y")
    // y op is now applied, pushing the c and k towards the end of the sequence
    //   content: hi maryck
    // positions: 012345678

    // remove(6, 7)
    // remove op now applied, but only removes content ordered before it
    //   content: hi mary
    // positions: 0123456
```

The key to this merge behavior is that a remove operation will only remove content that was visible to it when the
operation was made. In the example above, the remove op adjusted the range it removed, ensuring only the `ck` was
removed.

Another way to consider this behavior is that a remove operation will only remove content that was inserted earlier in
the order. Anything inserted after a remove operation will be ignored. The sequence also detects overlapping remove
operations, and the merge resolution is straightforward -- the data is removed.

### Merge strategy for annotate

As mentioned above, annotate operations behave like operations on SharedMaps. The merge strategy used is last writer
wins. If two collaborators set the same key on the annotate properties the operation that gets ordered last will
determine the value.

## Local references

Sequences support addition and manipulation of *local references* to locally track positions in the sequence over time.
As the name suggests, any created references will only exist locally; other clients will not see them.
This can be used to implement user interactions with sequence data in a way that is robust to concurrent editing.
For example, consider a text editor which tracks a user's cursor state.
The application can store a local reference to the character after the cursor position:

```typescript
    //   content: hi world!
    // positions: 012345678
    const { segment, offset } = sharedString.getContainingSegment(5)
    const cursor = sharedString.createLocalReferencePosition(
        segment,
        offset,
        ReferenceType.SlideOnRemove,
        /* any additional properties */ { cursorColor: 'blue' }
    );

    //    cursor:      x
    //   content: hi world!
    // positions: 012345678

    // ... in some view code, retrieve the position of the local reference for rendering:
    const pos = sharedString.localReferencePositionToPosition(cursor); // 5

    // meanwhile, some other client submits an edit which gets applied to our string:
    otherSharedString.replaceText(1, 2, "ello");

    // The local sharedString state will now look like this:
    //    cursor:         x
    //   content: hello world!
    // positions: 0123456789AB (hex)

    // ... in some view code, retrieve the position of the local reference for rendering:
    const pos = sharedString.localReferencePositionToPosition(cursor); // 8
```

Notice that even though another client concurrently edited the string, the local reference representing the cursor is still in the correct location with no further work for the API consumer.
The `ReferenceType.SlideOnRemove` parameter changes what happens when the segment that reference is associated with is removed.
`SlideOnRemove` instructs the sequence to attempt to *slide* the reference to the start of the next furthest segment, or if no such segment exists (i.e. the end of the string has been removed), the end of the next nearest one.

The [webflow](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/webflow/src/editor/caret.ts) example demonstrates this idea in more detail.

Unlike segments, it *is* safe to persist local references in auxiliary data structures, such as an undo-redo stack.

## Interval collections

Sequences support creation of *interval collections*, an auxiliary collection of intervals associated with positions in the sequence.
Like segments, intervals support adding arbitrary properties, including handles (references) to other DDSes.
The interval collection implementation uses local references, and so benefits from all of the robustness to concurrent editing
described in the previous section.
Unlike local references, operations on interval collections are sent to all clients and updated in an eventually consistent way.
This makes them suitable for implementing features like comment threads on a text-based documents.
The following example illustrates these properties and highlights the major APIs supported by IntervalCollection.


```typescript
    //   content: hi world!
    // positions: 012345678

    const comments = sharedString.getIntervalCollection("comments");
    const comment = comments.add(
        3,
        7, // (inclusive range): references "world"
        IntervalType.SlideOnRemove,
        {
            creator: 'my-user-id',
            handle: myCommentThreadDDS.handle
        }
    );
    //   content: hi world!
    // positions: 012345678
    //   comment:    [   ]

    // Interval collection supports iterating over all intervals via Symbol.iterator or `.map()`:
    const allIntervalsInCollection = Array.from(comments);
    const allProperties = comments.map((comment) => comment.properties);
    // or iterating over intervals overlapping a region:
    const intervalsOverlappingFirstHalf = comments.findOverlappingIntervals(0, 4);

    // Interval endpoints are LocalReferencePositions, so all APIs in the above section can be used:
    const startPosition = sharedString.localReferencePositionToPosition(comment.start);
    const endPosition = sharedString.localReferencePositionToPosition(comment.end);

    // Intervals can be modified:
    comments.change(comment.getIntervalId(), 0, 1);
    //   content: hi world!
    // positions: 012345678
    //   comment: []

    // their properties can be changed:
    comments.changeProperties(comment.getIntervalId(), { status: "resolved" });
    // comment.properties === { creator: 'my-user-id', handle: <some DDS handle object>, status: "resolved" }

    // and they can be removed:
    comments.removeIntervalById(comment.getIntervalId());
```

## SharedString

SharedString is a specialized data structure for handling collaborative text. It is based on a more general
Sequence data structure but has additional features that make working with text easier.

In addition to text, a SharedString can also contain markers.
Markers can be used to store metadata at positions within the text, like a reference to an image or Fluid object that should be rendered with the text.

Both markers and text are stored as segments in the SharedString.
Text segments will be split and merged when modifications are made to the SharedString and will therefore have variable length
matching the length of the text content they contain.
Marker segments are never split or merged, and always have a length of 1.

The length of the SharedString will be the combined length of all the text and marker segments.
Just like with other sequences, when talking about positions in a SharedString we use the terms near and far.
The nearest position in a SharedString is 0, and the farthest position is its length.
When comparing two positions the nearer positions is closer to 0, and the farther position is closer to the length.

### Intervals vs. markers

Interval endpoints and markers both implement *ReferencePosition* and seem to serve a similar function so it's not obvious how they differ and why you would choose one or the other.

Using the interval collection API has two main benefits:

1. Efficient spatial querying
    - Interval collections support iterating all intervals overlapping the region `[start, end]` in `O(log N) + O(overlap size)` time, where `N` is the total number of intervals in the collection.
    This may be critical for applications that display only a small view of the document contents.
    On the other hand, using markers to implement intervals would require a linear scan from the start or end of the sequence to determine which intervals overlap.

2. More ergonomic modification APIs
    - Interval collections natively support a modify operation on the intervals, which allows moving the endpoints of the interval to a different place in the sequence.
    This operation is atomic, whereas with markers one would have to submit a delete operation for the existing position and an insert for the new one.
    In order to achieve the same atomicity, those operations would need to leverage the `SharedSegmentSequence.groupOperation` API,
    which is less user-friendly.
    If the ops were submitted using standard insert and delete APIs instead, there would be some potential for data loss if the delete
    operation ended up acknowledged by the server but the insert operation did not.

### Examples

- Rich Text Editor Implementations
  - [webflow](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/webflow)
  - [flowView](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/shared-text/src/client-ui-lib/controls/flowView.ts)

- Integrations with Open Source Rich Text Editors
  - [prosemirror](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/prosemirror)
  - [smde](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/smde)

- Plain Text Editor Implementations
  - [collaborativeTextArea](https://github.com/microsoft/FluidFramework/blob/main/experimental/framework/react-inputs/src/CollaborativeTextArea.tsx)
  - [collaborativeInput](https://github.com/microsoft/FluidFramework/blob/main/experimental/framework/react-inputs/src/CollaborativeInput.tsx)

[SharedMap]: https://fluidframework.com/docs/data-structures/map/
[SharedString]: https://github.com/microsoft/FluidFramework/blob/main/packages/dds/sequence/src/sharedString.ts
