# editable-tree

Editable Tree is a simple API for accessing a Forest's data.

The entry point is `getEditableTree` which returns an `EditableTree` which allows reading and writing nodes of the Forest in a "JavaScript-object"-like manner.

There are four main usage modes for this API:

-   Generic tree readers: Code that can be applied to any tree, regardless of schema falls into this category.

    These users will want to use the "Untyped" subset of the API, which consists of a set of base interfaces that allow for generic tree navigation.
    This API surface still has access to all the data in the tree, and can also be used to read the schema of the data.
    This makes it suitable for operations like cloning, serializing, comparison, debug visualization and searching for parts of a tree the code does know know about.
    This API surface can also be thought of as a reflection API with the schema serving as the runtime type information.
    Since these users may not fully understand the semantics of the schema and the invariants of the data, this API subset does not provide editing.

-   Schema Aware tree readers and editors: code that is authored with specific schema in mind, and is statically typed based on those schema.

    These users will want to use the typed extension's to the generic untyped API (above).
    The `is` methods can be used to [narrow](https://www.typescriptlang.org/docs/handbook/2/narrowing.html) to this typed API when the schema is statically known.
    This API surface provides both reading and editing.
    Some of its access APIs (for example fields of structs) are `unboxed` meaning that wrappers providing no extra information (to someone who already knows the schema) are discarded or `boxed` meaning that all the layers of the tree (each field and node) are included.
    Note that all of the untyped APIs are boxed since generic users may need to inspect the schema of these layers to interpret them.
    For schema aware code, usually the unboxed version provide everything thats needed when reading the tree, but passing data into another API, or doing editing, access to these intermediate layers, bia the `boxed` version can sometimes be necessary.

    This could could be split up to separate reading and editing APIs.

-   JavaScript object focused use.
    This includes use-cases like passing the tree to generic javascript object processing libraries like `JSON.stringify`, nodes's `assert.deepEqual`, some structural clone implementations, [JMESPath](https://jmespath.org/) and many others.

    Since this is an open ended set of preexisting third party libraries, compatibility is on a best effort basis.
    However, a few things are taken into account: (TODO: actually implement this):

    -   The content visited by recursively walking over all the enumerable own properties should fully and unique describe the tree assuming the view schema is available.
        This requires some extra properties to prevent MapNodes and sequences from blocking the traversal, and provides guidance for which properties should be enumerable own properties.
    -   Adapters can be provided to (lazily) view any subtree in a more JavaScript object like form, with different options to pick different tradoffs like boxed vs. unboxed and including getters (as non-enumerable properties) back to the editable view.

    Like with the generic tree readers above, this case intentionally does not provide editing.
    Also like the generic tree readers case, it provides an easy way for code which does understand the schema to get back to the Schema Aware API for editing if needed.
    (TODO: Add APIs for doing such casts safely.
    Possible way to do instance of checks or symbols to recover which objects are nodes and fields)

-   Subscribing to changes.
    This includes cases like updating the user interface to reflect changes

    This could be considered part of either reading API, but is being addressed separately here.
    APIs for receiving these changes take the form of registering callbacks for events.
    These events can be triggered by anything that impacts the content of the tree including local edits, remote edits, merges, rebasing local edits, transaction rollback, undo etc.
    These can also be batching together, possibly eliminating intermediate states and reordering operations that don't impact each-other (like edits to different parts of the tree).
    This means these event subscriptions should only be treated as changes to the content, and users of them should not attempt to ascribe meaning or providence to any particular event.

    Some control over these events is available via branching which provides snapshot isolation (among other things):
    this is done at a higher level than the tree API covered here but can be accessed via each tree entities context property. (TODO: provide this access).

## Status

Minimal and unfinished.
In particular the "JavaScript object focused use" need work.
