# class-tree

This is a temporary directory containing a second implementation of the tree types from simple-tree, but built on-top of a customized schema system optimized for this specific tree API.

The main differences from the old schema system (SchemaBuilder and its related types):

1. The new schema system is layered on-top of internal one without leaking all the types from it into the public API.
   Wrappers, type erasure and casting in the implementation are used as required to accomplish this.
2. The new system is designed from scratch to work at the same abstraction layer and data model as used in simple-tree.
   This means concepts like `List` are supported in a first class way, and the focus is on kinds of nodes (List, Object, Map), and not on FieldKinds.
   No extra special cases and carve-outs are needed to support cases the internal data-model supports:
   tests for those cases will simply not use this wrapper layer and can use the pre-existing schema builder instead.
3. Schema are classes, and the instance types of those classes are what gets exposed in the tree API.
   This has many benefits:
    1. Users don't have to use `typeof` or invoke any type meta-functions to get the node types they want to pass around: just use the class/schema name as the type.
       This replaces `Typed<typeof myNodeSchema>` with just `MyNode`.
    2. Recursive schema work in `d.ts`` files due to use of classes.
       See [Generated d.ts includes implicit any for recursive types](microsoft/TypeScript#55832).
    3. Intellisense is much cleaner when referring to types defined in schema:
       it just uses the class name (for example `MyNode`) when referring to the node type or `typeof MyNode` when referring to the schema's type.
       These simplifications are what resolve the `d.ts`` issue noted above with recursive types.
    4. Normal JS/TS type narrowing with `instanceof` can be used with schema defined types.
    5. It's possible to add view/session local state to instances as properties, as well as adding methods by just putting them in the class like any other class.

Currently this implementation exposes the prototypes from these classes: this impacts some generic object based code.
For example, this probably impacts Node's deep equals as follows:

1. Two trees with the same "shape" but different types no longer compare equal.
2. Trees no longer compare equal to plain objects with no prototypes.

## Limitations

Fields allowing `Any` can not be supported due to the requirement to traverse all types from the root.

Returned classes from factory cannot have any private or protected members due to a [TypeScript limitation](https://github.com/microsoft/TypeScript/issues/36060).
This means getting nominal typing (non-structural typing) of node will require explicit members (like a strongly typed schema or type name symbol) if nominal typing is desired.
Private data can still be stored using `#` private fields, or via weak keyed maps or under symbols.
Even regular private and protected fields can be used in the implementation and casts away from the type returned by the factory,
though doing this risks name collisions with user added members.

Comparing trees to object literals (for example in tests), will require a dedicated tree comparison function and/or comparing to unhydrated nodes (and implementing more APIs for them) instead of plain literals.

Adding custom constructors to the schema classes is likely to break them, though static builders (like "create") can be added just fine.

### Insertable content

Currently the type allowed within InsertableContent comes from `InsertableTypedNode`.
This type includes `NodeBuilderData<T>`, which extracts the type from the constructor's parameter.
This allows changing what types can be used to build a node in a single place, however the logic to process that data is not part of the class currently.
This means that changing the types can easily lead to cases where runtime behavior of parsing or hydrating the `InsertableTypedNode` might not align with the types.
Directing the logic back into the schema for implementation would make extending the set of node kinds and adjusting constructor parameters much more encapsulated.

### Missing Tree Comparison test utility

There is currently no good API to dump tree content or compare it which includes all persisted data (including types).
Related to this there is also no good way to round trip a tree through an external system.
The lower-level APIs have solutions, but there currently aren't any for the simple/class tree layer.

### Recursive types are still very sketchy

Recursive objects can work ok, see notes on `SchemaFactory.fixRecursiveReference`.
This does not seem to fix directly recursive lists or maps (but some cases of co-recursive through object does seem to work).
Experiments are ongoing for how to fix them.

## Ideas to consider in the future

1. allow class schema to override methods to provide hooks. For example "serializeSessionState", to allow persisting things like selection. Maybe support via decorator? override methods for events?
