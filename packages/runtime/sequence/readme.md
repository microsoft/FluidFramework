# Shared Segment Sequence

Every item in a SharedSegmentSequence is at a specific position starting at 0, kind of like an array. However, it differs from an array in that the positions can move as local and remote collaborators make modifications to the sequence. There are a number of different sequence types:
- SharedString for storing and collaborating on a sequence of text
- SharedNumberSequence for storing and collaborating on a sequence of numbers
- SharedObjectSequence for storing and collaborating on a sequence of json serializable objects

As the name suggests SharedSegmentSequence, or sequence for short, are made of segments. Segments are the leaf nodes of the tree data structure that enables collaboration and backs the sequence. Segments may be split and merged as modifications are made to the sequence. Every segment has a length from 1, to the length of the sequence. The length of the sequence will be the combined length of all the segments.

When talking about positions in a sequence we use the terms _near_, and _far_. The nearest position in a sequence is 0, and the farthest position is its length. When comparing two positions the nearer position is closer to 0, and the farther position is closer to the length.

## Using a Sequence

Sequences support three basic operations: insert, remove, and annotate.

Insert operations on the sequence take a single position argument along with the content. This position is inclusive. This position can any position in the sequence including 0, and the length of the sequence.

```typescript
    //   content:
    // positions:

    // insert text a positions 0
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

Remove operations take a start and an end position. The start position is similar to the insert’s position, in that is can be any position in the sequence and is inclusive. However, unlike insert the start position cannot be the length of the sequence, as nothing exists there yet. The end position is exclusive and must be greater than the start, so it can be any value from 1 to the length of the sequence.

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

Annotate operations can add or remove map-like properties to or from content of the sequence. They can store any json serializable data and have similar behavior to a shared map. Annotate takes a start and end position which work the same way as the start and end of the remove operation. In addition to start and end annotate also takes a map-like properties object. Each key of the provided properties object will be set on each position of the specified range. Setting a property key to null will remove that property from the positions in the range.

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

Whenever an operation is performed on a sequence a _sequenceDelta_ event will be raised. This even provides the ranges affected by the operation, the type of the operation, and the properties that were changes by the operation.

## How Collaboration Works

Like other data structures the sequences are eventually consistent which means all collaborators will end up in the same final state, however, the intermediate states seen by each collaborator may not be seen by other collaborators. These intermediate states occur when two or more collaborators modify the same position in the sequence which results in a conflict.

The basic strategy for insert conflict resolution in the sequence is to merge _far_. This strategy depends on a fundamental property of the Fluid Framework, which is guaranteed ordering. So, if two or more collaborators perform an operation on a sequence, the operations will be given an ordering and all clients will see those operations in the same order. What this means for the merge _far_ strategy for resolving conflicting inserts is that the first operation will be placed in the conflicting position when it is received. When the next insert with the same position arrives and is applied it will be placed at the specified position and the previous inserts content position will be increased by the length of the incoming content pushing is farther towards the length of the sequence. This is what we call merging _far_.

Like insert the strategies for remove and annotate also rely on guaranteed ordering. For remove and annotate only content visible to the collaborator creating the operation will be modified, any content ordered after the won’t be.

For remove this means we can’t have an insert and a remove at the same time, as they will have an order, and all collaborators will see the operations in the same order. We also detect overlapping removes made by different collaborators, the resolutions here is straightforward, the content is removed.

As mentioned above annotate operations behave like operations on Shared Maps. The merge strategy here is last one wins. So, if two collaborators set the same key on the annotates properties the operation that gets ordered last will determine the value.

# Shared String

The Shared String is a specialized data structure for handling collaborative text. It is based on a more general Sequence data structure but has additional features that make working with text easier.

In addition to text, a Shared String can also contain markers. Markers can be used to store metadata at positions within the text, like the details of an image or component that should be rendered with the text.

Both markers and text are stored as segments in the Shared String. Text segments will be split and merged when modifications are made to the Shared String and will therefore have variable length matching the length of the text content they contain. Marker segments are never split or merged, and always have a length of 1.

### Examples
- Rich Text Editor Implementations
  - packages\components\webflow\
  - packages\components\markflow\
  - packages\components\client-ui-lib\src\controls\flowView.ts

- Integrations with Open Source Rich Text Editors
  - examples\components\prosemirror\
  - examples\components\smde\src\
  - examples\components\draft-js\

- Plain Text Editor Implementations
  - packages\framework\aqueduct-react\src\react\collaborativeTextArea.tsx
  - packages\framework\aqueduct-react\src\react\collaborativeInput.tsx

# Sparse Matrix

The Sparse Matrix is a specialized data structure for efficiently handling collaborative tabular data. The Sparse Matrix works in a similar fashion to [raster scanning](https://en.wikipedia.org/wiki/Raster_scan). When a row is inserted it is inserted with the maximum possible number of columns, 16,385. This makes it easy to find any cell in the Sparse Matrix as it will exist at Row * MaxCol + Col. In order to store this efficiently the Sparse Matrix doesn't materialize cells that don't have data, this is where *Sparse* comes from.

Just like any other sequence, the Sparse Matrix is made of segments. The segment types are RunSegments and PaddingSegments. RunSegment contain the data for cells that have data, and PaddingSegments fill the spaces that have no data. PaddingSegments just contain how long they are, and this is how the Sparse Matrix efficiently stores all the rows with the max number of columns. For instance, if we had a Matrix with 2 rows, and each row only contained data in a couple columns it's serialized form would look something like this:
``` Json
[
// The first row with data in 1st and 2nd column
    // data
    {
        "items":["Value in row 0 cell 0", "Value in row 0 cell 1"],
        "length": 2,
    },
    // padding
    {
        "length": 16383,
    },

// The second row with data in the 1st and 5th column
    // data
    {
        "items":["Value in row 1 cell 0"],
        "length": 1,
    },
    // padding
    {
        "length": 3,
    },
    // data
    {
        "items":["Value in row 1 cell 4"],
        "length": 1,
    },
    // padding
    {
        "length": 16380,
    },
]
```
