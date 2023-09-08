# editable-tree

Editable Tree is a simple API for accessing a Forest's data.

The entry point is `getEditableTree` which returns an `EditableTree` which allows reading and writing nodes of the Forest in a "JavaScript-object"-like manner.

There are four main usage modes for this API:

-   Generic tree readers: Code that can be applied to any tree, regardless of schema falls into this category.

    These users will want to use the "Untyped" subset of the API, which consists of a set of base interfaces that allow for generic tree navigation.
    This API surface still has access to all the data in the tree, and can also be used to read the schema of the data.
    This makes it suitable for operations like cloning, serializing, comparison, debug visualization and searching for parts of a tree the code does not know about.
    This API surface can also be thought of as a reflection API with the schema serving as the runtime type information.
    Since these users may not fully understand the semantics of the schema and the invariants of the data, this API subset does not provide editing.

-   Schema Aware tree readers and editors: code that is authored with specific schema in mind, and is statically typed based on those schema.

    These users will want to use the typed extensions to the generic untyped API (above).
    The `is` methods can be used to [narrow](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) to this typed API when the schema is statically known.
    This API surface provides both reading and editing.
    Some of its access APIs (for example fields of structs) are `unboxed` meaning that wrappers providing no extra information (to someone who already knows the schema) are discarded or `boxed` meaning that all the layers of the tree (each field and node) are included.
    Note that all of the untyped APIs are boxed since generic users may need to inspect the schema of these layers to interpret them.
    For schema aware code, usually the unboxed version provide everything that's needed when reading the tree, but when passing data into another API or doing editing, access to these intermediate layers via the `boxed` version can sometimes be necessary.

    This could could be split up to separate reading and editing APIs.

-   JavaScript object focused use.
    This includes use-cases like passing the tree to generic javascript object processing libraries like `JSON.stringify`, node's `assert.deepEqual`, some structural clone implementations, [JMESPath](https://jmespath.org/) and many others.

    Since this is an open ended set of preexisting third party libraries, compatibility is on a best effort basis.
    However, a few things are taken into account:

    -   The content visited by recursively walking over all the enumerable own properties should fully and uniquely describe the tree assuming the view schema is available (see "Javascript Object API: `enumerable` and `own` properties" below for details).
        This requires some extra properties to prevent MapNodes and sequences from blocking the traversal, and provides guidance for which properties should be enumerable own properties.
    -   Adapters can be provided to (lazily) view any subtree in a more JavaScript object like form, with different options to pick different trad-offs like boxed vs. unboxed and including getters (as non-enumerable properties) back to the editable view. (TODO: actually implement this):

    Like with the generic tree readers above, this case intentionally does not provide editing.
    Also like the generic tree readers case, it provides an easy way for code which does understand the schema to get back to the Schema Aware API for editing if needed.
    (TODO: Add APIs for doing such casts safely.
    Possible way to do instance of checks or symbols to recover which objects are nodes and fields)

-   Subscribing to changes.
    This includes cases like updating the user interface to reflect changes

    This could be considered part of either reading API, but is being addressed separately here.
    APIs for receiving these changes take the form of registering callbacks for events.
    These events can be triggered by anything that impacts the content of the tree including local edits, remote edits, merges, rebasing local edits, transaction rollback, undo etc.
    These can also be batched together, possibly eliminating intermediate states and reordering operations that don't impact eachother (like edits to different parts of the tree).
    This means these event subscriptions should only be treated as changes to the content, and users of them should not attempt to ascribe meaning or providence to any particular event.

    Some control over these events is available via branching which provides snapshot isolation (among other things):
    this is done at a higher level than the tree API covered here but can be accessed via each tree entity's context property. (TODO: provide this access).

## Javascript Object API: `enumerable` and `own` properties

See [Mozilla's Enumerability and ownership of properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties) for context.
Note that `enumerable` has nothing to do with TypeScript's `Iterable` interface or JavaScript's `Symbol.iterator` and the related `for...of` loops: all of those are irrelevant to this section.

Despite this tree API primarily being a TypeScript API, and TypeScript types having no way to indicate if members are `enumerable` or `own`, these details matter, even to TypeScript users.

For example, TypeScript assumes all members of interfaces are `enumerable` and `own` when using the [Object spread](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Spread_syntax) operator.
TypeScript also assumes all non-method members of classes are `enumerable` and `own`, but allows assigning the class to an interface where it will start treating the methods as `enumerable` and `own` despite it being the same object.
This compile time behavior often does not match what happens at runtime, so users of TypeScript are likely to run into issues despite their code compiling just fine if they rely on Object spread, or make assumptions about what properties are `enumerable` or `own`.

Many existing libraries users of tree are likely to work with will also make assumptions about `enumerable` or `own`.

So in addition to the TypeScript types, a separate decision needs to be made about what guarantees this library will make about `enumerable` and `own` properties.

This library guarantees that when traversing from a root `UntypedEntity` via `enumerable` `own` properties:

-   All callable members are `inherited` (not `own`) or not `enumerable` and thus work like class methods. Note that TypeScript's type checking will get this wrong due to the API using interfaces.
-   When starting at a root node or fields, there is exactly one way to traverse to (or past in some unboxed cases) every node and field under it via only `enumerable` `own` properties.
-   Every leaf node's value within the tree will be reachable, either from its node, or as its node (in the unboxed case). Note that values are assumed to be immutable, and if multiple leaves hold structurally identical objects as values they may or may not be shared and this difference is not considered significant. TODO: determine how node's assert.deepEqual compares these cases.
-   Every node traversed has an unambiguous type, either implied by its position and parent's schema (for unboxed cases) and/or from an `enumerable` `own` property containing the schema's identifier.
-   No cycles will be encountered, with the exception of any `FluidHandle` stored as part of serializable values on `LeafNode`s.
-   Content outside of the tree, such as its schema objects and context, will not be reachable.
-   No symbols will be encountered as keys. This ensures that the traversal can use the APIs which only support strings (like `Object.entries`) and get the same result as if using APIs which also support symbols (like `object spread`).

Note that if using `for...in`, be sure to filter out `inherited` properties.
Using [Object.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries) or similar [alternatives that omit inherited and non enumerable properties](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties#traversing_object_properties) will usually be simpler.

## Status

Mostly implemented, but lacking a lot of tests.
