# flex-tree

Flex Tree (previously Editable Tree) is a simple API for accessing a Forest's data.

The entry point is `getTreeContext` which provides a root `TreeField` which allows reading and writing nodes of the Forest.

## Usage modes

There are two main usage modes for this API:

### Generic tree readers

Code that can be applied to any tree, regardless of schema falls into this category.

These users will want to use the "Untyped" subset of the API, which consists of a set of base interfaces that allow for generic tree navigation.
This API surface still has access to all the data in the tree, and can also be used to read the schema of the data.
This makes it suitable for operations like cloning, serializing, comparison, debug visualization and searching for parts of a tree the code does not know about.
This API surface can also be thought of as a reflection API with the schema serving as the runtime type information.
Since these users may not fully understand the semantics of the schema and the invariants of the data, this API subset does not provide editing.

### Generic tree editors

This use-case exists to facilitate authoring of wrappers around this API which provide editing functionality, like the simple-based API.
Validation is the responsibility of the caller.

### Subscribing to changes.

This includes cases like updating the user interface to reflect changes.

This could be considered part of either reading API, but is being addressed separately here.
APIs for receiving these changes take the form of registering callbacks for events.
These events can be triggered by anything that impacts the content of the tree including local edits, remote edits, merges, rebasing local edits, transaction rollback, undo etc.
These can also be batched together, possibly eliminating intermediate states and reordering operations that don't impact each other (like edits to different parts of the tree).
This means these event subscriptions should only be treated as changes to the content, and users of them should not attempt to ascribe meaning or providence to any particular event.

Some control over these events is available via branching which provides snapshot isolation (among other things):
this is done at a higher level than the tree API covered here but can be accessed via each tree entity's context property. (TODO: provide this access).

## Status

Currently being simplified to reduce and eventually remove the flex tree schema abstraction: all usages at this level should be replaced by stored schema.
