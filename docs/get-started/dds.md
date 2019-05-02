---
uid: dds
---

# Distributed Data Structures

Much of Prague's power lies in a set of base primitives called distributed data structures, or distributed data types.

Distributed data structures such as <xref:map.SharedMap> and the various types in the <xref:sequence> package are
[eventually consistent](https://en.wikipedia.org/wiki/Eventual_consistency). The Prague runtime manages these data
structures; as changes are made locally and remotely, they are merged in seamlessly by the runtime.

When you're working with a DDS, you can largely treat it as a local object. You can make changes to it at as needed.
However, this local object can be changed not *only* by your local code, but also by the Prague runtime. The Prague
runtime is responsible for inbounding changes from the server and then replaying those changes locally. This means your
code should be structured to react to changes to the DDS instances and update accordingly.

As you make changes to the local DDS instance, the changes are sent to the Prague server. Other clients are notified of
the change -- or they can query the server for changes -- and then merge the changes in locally. All of this is managed
by the Prague runtime.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way *eventually*. This is a guarantee made by the Prague runtime.
Thus, you need not check for changes prior to 'committing' local changes. If there are changes on the server, they will
be retrieved and merged in seamlessly, and events will be emitted by the data structures, allowing your code to react to
the changes if needed. And this all happens *very* quickly.

> [!TIP]
> To avoid UI jitter when when inbounding a lot of changes, consider just rendering based on frames per second, rather
> than on data inbound. At data inbound you can invalidate portions of the UI to re-render when you render next. This
> decoupling rendering from data inbound should reduce UI jitter.

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the data structures
in the <xref:consensus-ordered-collection> package are useful. The types in this package defer operations until
acknowledged by the server. This ensures that each client `.pops()` a different value from a stack, for example.


## Type Hierarchy

```text
├── SharedMap
├─┬ SharedSegmentSequence<TSegment> (Low-level base class for "sequence like things")
│ ├── SharedString (Special type for strings)
│ └─┬ SharedSequence<T> (Base class for arrays)
|   ├── SharedObjectSequence (Array of objects)
|   └── SharedNumberSequence (Array of numbers)
├─┬ ConsensusOrderedCollection
  ├── ConsensusStack
  └── ConsensusQueue
```

## Merge behavior

Each distributed data structures has a different merging behavior. These behaviors can affect design decisions.

Misc notes

* The Prague data model is a tree
* Merges happen at the level of Prague data structures representing this tree (both leaf and non-leaf nodes);
  application data representation has to assume its semantic invariants are not broken by concurrent access and Prague's
  merge resolution behavior.
* Introduction into container / component model, single ordering across all data structures in container.


## Eventing model

* How do I know when inbound updates are coming in? Do they happen on clean stack or I should assume any call into
  Prague can result in document state change?)


## Other resources

* <xref:writing-dds>
