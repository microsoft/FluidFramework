# class-tree

This is a temporary directory containing a second implementation of the tree types from simple-tree, but built on-top of a customized schema system optimized for this specific tree API.

The main differences from the old schema system (SchemaBuilder and its related types):

1. The new schema system is layered on-top of the without leaking all the types from it into the public API.
   Wrappers, type erasure and casting in the implementation are used as required to accomplish this.
2. The new system is designed from scratch to work at the same abstraction layer and data model as used in simple-tree.
   This means concepts like `List` are supported in a first class way, and the focus is on kinds of nodes (List, Object, Map), and not on FieldKinds.
   No extra special cases and carve-outs are needed to support cases the internal data-model supports:
   tests for those cases will simple not use this wrapper layer and can use the pre-existing schema builder instead.
3. Schema are classes, and the instance types of those classes are what gets exposed in the tree API.
   This has many benefits:
    1. Users don't have to use "typeof" or invoke any type meta-functions to get the node types they want to pass around: just use the class/schema name as the type.
    2. Recursive schema work inb d.ts files due to use of classes. See [Generated d.ts includes implicit any for recursive types](microsoft/TypeScript#55832).
    3. Intelisense is much cleaner when referring to types defined in schema: It just uses the class name. or "typeof ClassName". (These simplifications are what resolve the d.ts issue noted above with recursive types)
    4. Normal JS/TS type narrowing with instanceof can be used with schema defined types.
    5. Its possible to add view/session local state to instances as properties, as well as adding methods by just putting them in the class like any other class.
    6. Since the schema/class defines the API for the node, the implementation of the tree API implicitly gets defined in a way that is trivially extensible for adding new node kinds.
    7. Implementing the APIs for these node kinds does not require redundantly defining an interface and an implementation: a single concrete implementation can be defined, with the types inferred from it: this should making implementing large API surfaces (like we have for list) cleaner.
       Note that this may not end up being a benefit in practice depending on how the generated API docs turn out: explicit interfaces might end up being required anyway.

Currently this implementation exposes the prototypes from these classes: this impacts some generic object based code.
For example, this probably impacts Node's deep equals as follows:

1. Two trees with the same "shape" but different types no longer compare equal.
2. Trees no longer compare equal to plain objects with no prototypes.
