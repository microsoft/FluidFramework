# Shared Segment Sequence

Every item in a SharedSegmentSequence is at a specific position starting at 0, kind of like an array. However, it differs from an array in that the positions can move as the local and remote collaborators make modifications. There are a number of different sequence types:
- SharedString for storing and collaborating on a sequence of text
- SharedNumberSequence for storing and collaborating on a sequence of numbers
- SharedObjectSequence for storing and collaborating on a sequence of json serializable objects

As the name suggests SharedSegmentSequence, or sequences for short, are made of segments. Segments are the leaf nodes of the tree data structure that enables collaboration and backs the sequence. Segments may be split and merged as modifications are made to the sequence. Eveny segment has a length from 0, to the length of the sequence. The length of the sequence will be the combined length of all the segments.

When talking about positions in a sequence we use the terms _near_, and _far_. The nearest position in a sequence is 0, and the farthest position is its length. When comparing two positions the nearer position is closer to 0, and the farther position is closer to the length.

## Using a Sequence

Sequences supports three basic operations: insert, remove, and annotate.

Insert operations on the sequence take a single position argument along with the content. This position is inclusive. This position can any position in the sequence including 0, and the length of the shared string.

```typescript
    // with an empty shared string
    sharedString.insertText(0, "hi world");
    //   content: hi world
    // positions: 01234567
```

Remove operations take a start and an end position. The start position is similar to the insert’s position, in that is can be any position in the sequence and is inclusive. However, unlike insert it cannot be the length of the sequence, as nothing exists there yet. The end position is exclusive and must be greater than the start, so it can be any value from 1 to the length of the sequence.

```typescript
    //   content: hi world
    // positions: 01234567
    sharedString.removeRange(0, 4);
    //   content: world
    // positions: 01234567
```

Annotate operations can add or remove map- like properties to or from content of the sequence. They can store any json serializable data and have similar behavior to a shared map. Annotate takes a start and end position which work the same way as the start and end of the remove operation. In addition to start and end annotate also takes a map like properties object. Each key of the provided properties object will be set on the properties of each position of the specified range. Setting a property key to null will remove that property from the positions in the range.

```typescript
    const preProps2 = sharedString.getPropertiesAtPosition(2);
    const preProps5 = sharedString.getPropertiesAtPosition(5);
    // preProps2 = {}
    // preProps5 = {}
    sharedString.annotateRange(0, 4, { fontWeight: 5 });
    const postProps2 = sharedString.getPropertiesAtPosition(2);
    const postProps5 = sharedString.getPropertiesAtPosition(5);
    // preProps2 = { fontWeight: 5 }
    // preProps5 = {}
```

Whenever an operation is perfomed on a sequence a _sequenceDelta_ event will be raised. This even provides the ranges affected by the operation, the type of the operation, and the properties that were changes by the operation.

## How Collaboration Works

Like other data structures the sequences are eventually consistent which means all collaborators will end up in the same final state;, however, the intermediate states seen by each collaborator may not be seen by other collaborators. These intermediate states occur when two or more collaborators modify the same position in the sequence which results in a conflict.

The basic strategy for insert conflict resolution in the sequence is to merge _far_. This strategy depends on a fundamental property of the Fluid Framework, which is guaranteed ordering. So, if two or more collaborators perform an operation on a sequence, the operations will be given an ordering and all clients will see those operations in the same order. What this means for the merge _far_ strategy for resolving conflicting inserts is that the first operation will be placed in the conflicting position when it is received. When the next insert with the same position arrives and is applied it will be placed at the specified position and the previous inserts content position will be increased by the length of the incoming content pushing is farther towards the length of the sequence. This is what we call merging _far_.

Like insert the strategies for remove and annotate also rely on guaranteed ordering. For remove and annotate only content visible to the collaborator creating the operation will be modified, any content ordered after the won’t be.

For remove this means we can’t have an insert and a remove at the same time, as they will have an order, and all collaborators will see the operations in the same order. We also detect overlapping removes made by different collaborators, the resolutions here is straightforward, the content is removed.

As mentioned above annotate operations behave like operations on Shared Maps. The merge strategy here is last one wins. So, if two collaborators set the same key on the annotate's properties the operation that gets ordered last will determine the value.

# Shared String

The Shared String is a specialized data structure for handling collaborative text. It is based on a more general Sequence data structure but has additional features that make working with text easier.

In addition to text, a Shared String can also contain markers. Markers can be used to store metadata at positions within the text, like the details of an image or component that should be rendered with the text.

Both markers and text are stored as segments in the Shared String. Text segments will be split and merged when modifications are made to the Shared String and will therefore have variable length matching the length of the text content they contain. Marker segments are never split or merged, and always have a length of 1.
