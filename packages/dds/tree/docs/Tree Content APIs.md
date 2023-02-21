# Tree Content APIs

Audience: Developers familiar with the Fluid Framework and tree data-structures.
References to more specific concepts from Shared Tree, like FieldKinds, should be included where relevant, but the document should be understandable without knowing about them.

Scope: **use-cases** and **goals** of APIs for accessing and editing the contents of shared tree.
This includes possible future APIs, and the **use-cases** and **goals** for those APIs.
This does NOT cover the actual details of these APIs or branch-related APIs for having multiple versions of the tree concurrently.

## Low Level APIs

These API surfaces are mainly intended to abstract away concrete details of the implementation.
They are designed to be able to be stable across future optimizations (such as compressed formats) and compatible with future features (like new FieldKinds).

These APIs exist to support writing the high level APIs.
They are abstractions to allow optimizing the tree data representations without breaking or complicating the high-level API implementations.
These abstractions also allow comparing performance and correctness between different data representations.

It is currently undecided if these low level APIs will be part of the package's exported API set: even if they are not exported, keeping them stable should be practical, and ease supporting multiple different high level API versions at once.

### Low Level Data Abstraction

Status: currently implemented as [ITreeCursor](../src/core/tree/cursor.ts).

For performance reasons, it is desirable to support multiple tree representations with a single API to access them.
This allows future changes to add new, more optimized tree formats without breaking APIs.

ChunkedForest is a work in progress leveraging this pattern to provide efficiently forkable compressed tree storage.

Note that while all data structures which can be traversed using a cursor are themselves tree content APIs, any that are primarily intended to be worked with through a cursor will not be covered in this document.

### Rebaseable Change Representations

Status: currently implemented `TChange` types, which are specific to each `ChangeFamily` implementations.
The `DefaultChangeset` (which is the one used by [SharedTree](../src/shared-tree/README.md)) is `ModularChangeset` from [modular-schema](../src/feature-libraries/modular-schema/README.md)

This is the lowest level change representation, and must support being rebased over other changes.
It also must have a stable serialized format and stable behavior (what it does when applied to trees, and how it rebases)
as long as documents which can contain it are supported (which for the `DefaultChangeset` will be from package release to forever).

These change types are expected to accumulate cruft related to backwards compatibility over time,
so the production implementation (`ModularChangeset`) is designed to be modular to manage this complexity.

Not intended to be exposed in the package API.

### Low Level Editing

Status: currently implemented by `ModularEditBuilder`.

The low level editing API creates the rebaseable changes described above.
Like the rebaseable changes, the low level editing API is an aspect of the `ChangeFamily` implementation.
This means that the main implementation is the one thats part of [modular-schema](../src/feature-libraries/modular-schema/README.md) which is `ModularEditBuilder`.

### Delta

Status: currently implemented `Delta` and `DeltaVisitor`.

Describes a change to a specific version of a tree.
Cannot be rebased.
Does not need a stable persisted format.
Independent of `ChangeFamily` (meaning only a single version is needed, regardless of what editing APIs are added).

Used to update [forest](../src/core/forest/README.md) and `AnchorSet`.
Can also be used to update anything else that stores a copy of some of the tree data that needs to be kept up to date.

## High Level APIs

These APIs are built on-top of the low level APIs and make less of an effort to plan for forwards compatibility.
Instead their focus is on providing an ideal developer experience for their users.
Ideally these APIs will be able to be updated incrementally with non-breaking changes,
but in the event that major breaking changes are needed a new high level API can be created to address the new needs,
and can be maintained in parallel with the older APIs until they are deprecated and removed.

Note that currently all of these APIs are available on [EditableTree](../src/feature-libraries/editable-tree/README.md) allowing the ideal one to be selected by the user from a single object.

### JavaScript Object like API

Status: currently implemented by "EditableTree".

This API focuses on providing an API that is concise, intuitive and discoverable for developers familiar with JavaScript objects.

It is designed so that it is possible to generate friendly schema aware TypeScript types for it.

Includes Editing.

### Tree "Reflection" API

Status: currently implemented by "EditableTree".

Provides an API for accessing and editing the underlying tree data-model.
Views fields as sequences of nodes and allows looking up schema information.
Can look up schema for any node or field.

Mainly used by schema independent logic (works on any tree, regardless of its schema).
Users of these APIs are not expected to know what invariants the document contains (schema and otherwise) so this API is mainly used for viewing data but not editing it.
Use-cases include things like copying, importing or exporting data, debugging tools, and occasional edge cases where the other more specific APIs can't quite do what's needed (for example if you need to get access to the field object in a case where the "JavaScript Object like API" implicitly inlines the value).

### Change notification API

Status: planned to be implemented by "EditableTree".

An API similar to PropertyDDS's property binder should be included.
It will provide a way to bind events to subtrees, which can be selected via APIs on "EditableTree".
Design is in the early planning stages so details are not yet covered here.
