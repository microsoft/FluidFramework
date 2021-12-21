# @fluidframework/sequence

The **@fluidframework/sequence** packages supports distributed data structures which are list-like.  It includes
SharedString for storing storing and simultaneously editing a sequence of text. Note that SharedString is a sequence
DDS but it has additional specialized features and behaviors for working with text.

Sequence DDSes share a common base class, SharedSegmentSequence. For the remainder of this document, the term
*sequence* refers to this base class.

*Item*s are the individual units that are stored within the sequence (i.e. in a SharedString the items are characters),
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

Sequences support three basic operations: insert, remove, and annotate. Insert and remove are used to add and remove
items from the sequence, while annotate is used to add metadata to items.

Insert operations on the sequence take a single position argument along with the content. This position is inclusive and
can be any position in the sequence including 0, to insert at the beginning of the sequence, and the length of the
sequence, to insert at the end.

```typescript
    //   content:
    // positions:

    // insert text at positions 0
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

Whenever an operation is performed on a sequence a *sequenceDelta* event will be raised. This event provides the ranges
affected by the operation, the type of the operation, and the properties that were changes by the operation.

## Sequence merge strategy

The Fluid sequence data structures are eventually consistent, which means all editors will end up in the same
final state. However, the intermediate states seen by each collaborator may not be seen by other collaborators. These
intermediate states occur when two or more collaborators modify the same position in the sequence which results in a
conflict.

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

As mentioned above, annotate operations behave like operations on SharedMaps. The merge strategy used is last writer
wins. If two collaborators set the same key on the annotate properties the operation that gets ordered last will
determine the value.

## SharedString

The SharedString is a specialized data structure for handling collaborative text. It is based on a more general
Sequence data structure but has additional features that make working with text easier.

In addition to text, a SharedString can also contain markers. Markers can be used to store metadata at positions within
the text, like the details of an image or Fluid object that should be rendered with the text.

Both markers and text are stored as segments in the SharedString. Text segments will be split and merged when
modifications are made to the SharedString and will therefore have variable length matching the length of the text
content they contain. Marker segments are never split or merged, and always have a length of 1.

The length of the SharedString will be the combined length of all the text and marker segments. Just like with other
sequences, when talking about positions in a SharedString we use the terms near and far. The nearest position in a
SharedString is 0, and the farthest position is its length. When comparing two positions the nearer positions is closer
to 0, and the farther position is closer to the length.

### Examples

- Rich Text Editor Implementations
  - [webflow](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/webflow)
  - [flowView](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/client-ui-lib/src/controls/flowView.ts)

- Integrations with Open Source Rich Text Editors
  - [prosemirror](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/prosemirror)
  - [smde](https://github.com/microsoft/FluidFramework/tree/main/examples/data-objects/smde)
  - [draft-js](https://github.com/microsoft/FluidExamples/tree/main/draft-js)

- Plain Text Editor Implementations
  - [collaborativeTextArea](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/react-inputs/src/CollaborativeTextArea.tsx)
  - [collaborativeInput](https://github.com/microsoft/FluidFramework/blob/main/examples/data-objects/react-inputs/src/collaborativeInput.tsx)

[SharedMap]: https://fluidframework.com/docs/data-structures/map/
