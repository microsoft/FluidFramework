# Modular Change Family

Merge semantics in `SharedTree` are mostly associated with fields.
For example, a sequence field has different merge semantics than an optional field does.

`ModularChangeFamily` is an implementation of `ChangeFamily` which delegates work in a given field to the appropriate `FieldKind`.
A `ModularChangeFamily` instance is parameterized with a set of `FieldKind` implementations.

The purpose of `ModularChangeFamily` is twofold:

1. Encapsulates the logic for handling changes to nodes.
2. Allow collaborative editing of documents with fields of different kinds.

## Revision Info

Some `FieldKind` implementations need to know which revision a given change is associated with.
`ModularChangeFamily` keeps track of revision information using `RevisionTag`s so it can provide `FieldKind` implementations with this information when invoking their `rebase`, `invert`, and `compose` functions.

### Revision Info At Rest

First, it's helpful to consider how revision info is maintained in changeset structures.
Here "at rest" is in opposition to "during rebase/invert/compose".

`ModularChangeFamily` maintains revision info such that for each portion of the changeset that is associated with a specific `RevisionTag`,
`ModularChangeFamily` is able to recover the `RevisionTag` for that portion.
The only exception is the case where changes for a single field are contributed by multiple revisions:
the `ModularChangeFamily` keeps track of the revision info associated with the changes made to the individual subtrees rooted in that field,
but it doesn't keep track of the revisions associated with the changes in the field itself.
The responsibility for keeping track of this information falls on the `FieldKind` implementation for that field,
which may have no need for such information and may therefore not bother maintaining it.

There are four possible locations where revision information can be stored:

1. With the root of the changeset (on `TaggedChange<FieldChangeMap>.revision`)
2. With the change information associated with a specific field of a specific node (on `FieldChange.revision`)
3. With the change information associated with the value of a specific node (on `NodeChangeset.valueChange.revision`)
4. Within the `FieldKind`-specific data on each field (within `FieldChange.change`)

#4 is considered an implementation detail of `FieldKind`s, and is completely opaque to `ModularChangeFamily`.
The `ModularChangeFamily` implementation is agnostic to the possibility that a `FieldKind` may store such information and therefore does not rely on it.
In other words, any revision info stored in `FieldKind`-specific data structures does not contribute to `ModularChangeFamily`'s bookkeeping of revision information.
We ignore #4 in the rest of this document.

In all other cases (#1, #2, and #3) the `revision` field may be either populated or undefined, with the following semantics:

A populated `revision` field indicates that all the changes included on the data structure that sports this `revision` field
(including recursive changes)
are associated with the given revision.

An undefined `revision` field can occur in three cases:

    A) When a revision is specified on an ancestor of the current structure, in which case the changes to the current structure (and all nested structures) are associated with that revision.
    B) When the changes in the current structure (or its nested structures) are associated with multiple revisions.
    C) When the changes are associated with an anonymous (i.e., tag-less) edit.

C) Is a special case that will likely be excluded in future implementations.
For now it is treated as a special case of A).

Note that #1 is special in that A) never applies to it (since it is the root).
Similarly #4 is special in that B) never applies to it (since it only ever represents the change in value prescribed by a single revision).

The above rules mean that, unless a change was contributed by an anonymous edit, at least one populated `revision` field should be encountered when walking down from the root to any given portion of a changeset.
The above rules do not prescribe that exactly one populated `revision` field will be encountered,
so any logic based on the above must give precedence to lower (i.e., higher tree depth) revision information.

### Revision Info During Operations

We now consider how revision info flows through the recursive invocations of `rebase`, `invert`, and `compose`.

#### Invert and Rebase

In the `invert` case, `ModularChangeFamily` provides revision information to the `FieldKind`'s `invert` implementation.
This is accomplished by considering the following sources of revision information:

    i. The field whose changes are being inverted bears revision information (see #2 in the previous section).
    ii. The field whose changes are being inverted has an ancestor field that bears revision information (#2 again).
    iii. The field whose changes are being inverted is part of a tagged changeset (see #1)

If none of the three possibilities above yield revision information then an `undefined` revision is passed to the `FieldKind`'s `invert` implementation.
This can occur in two cases:

-   The changes for the field were contributed by an anonymous change.
-   The changes for the field were contributed by multiple changes.
    In this latter case, the `FieldKind`-specific change data
    (which is opaque to `ModularChangeFamily`)
    may contain more precise information about which part of the changes are associated with various revisions,
    but that is entirely left up to the `FieldKind` implementation.

When the `FieldKind`'s `invert` implementation recurses by calling the `NodeChangeInverter`,
`ModularChangeFamily` is able to determine the revision info of the `NodeChangeset` (and nested changes) by taking into account (in order of highest to lowest precedence):

-   The revision information associated with the field/value changes for that node (see #2 & #3) if present.
-   The revision information for the field changes within which the `NodeChangeset` is contained (see #i, #ii, #iii).

If neither of these yield a defined revision then the changes to the `NodeChangeset` were either contributed by an anonymous or by multiple changes.

In the `rebase` case, we do not anticipate the `FieldKind`'s `rebase` implementation needing to know the revision info for the change being rebased, so `ModularChangeFamily` does not plumb that information through.
We do however know that some `FieldKind`'s `rebase` implementation needs to know the revision info for the base change (i.e., the change that is being rebased over) so `ModularChangeFamily` does plumb that information through.
This is accomplished in the same way as it is for the `invert` implementation.

#### Compose

In the `compose` case, `ModularChangeFamily` does plumb revision info through for all changes.
This creates a complication when the `FieldKind`'s `compose` implementation calls `NodeChangeComposer`, and `ModularChangeFamily` needs to look up the revision info for the field changes that contain a given `NodeChangeset` passed to `NodeChangeComposer`.
The complication stems from the fact that `ModularChangeFamily` has no way of determining how the `NodeChangeset`s passed to `NodeChangeComposer` correspond to the field changesets it had passed to the `FieldKind`'s `rebase` implementation.
For example, if `ModularChangeFamily` calls the `FieldKind`'s `compose` implementation and passes it changesets associated with revisions foo, bar, and baz,
and the `FieldKind`'s `compose` implementation then invokes the `NodeChangeComposer` with `NodeChangeset`s from the two of the changesets it was given,
then there's no way for the `ModularChangeFamily` to know whether these two `NodeChangeset`s came from foo and bar, foo and baz, or bar and baz respectively.

There are different ways this complication can be overcome.
The current implementation requires the caller of the `NodeChangeComposer` to explicitly tag the `NodeChangeset`s it passes.

Note that the ability of `NodeChangeComposer` to recover revision info for each of the `NodeChangeset`s it is given is not only necessary for the sake of passing the adequate revision info to nested field's `compose` implementations,
it is also necessary for the sake of maintaining the information described in the previous section.

For example, if a pair of `NodeChangeset`s from revisions foo and bar are passed to `NodeChangeComposer`,
it possible that the given `NodeChangeset`s do not explicitly contain revision data because they relied on a higher field (or the root changeset structure) to indicate their associated revision.
After these `NodeChangeset`s are composed, the higher fields (and root) will not contain such revision information because those higher fields and root will be composites of multiple changes.
This means `NodeChangeComposer` must ensure that the `NodeChangeset` it returns is self-sufficient when it comes to describing which of its parts are associated with a given revision.

If the `NodeChangeset` associated with revision foo only carries change information for field "foo" and the `NodeChangeset` associated with revision bar carries change information for the value of the node,
then the resulting `NodeChangeset` must have:

-   A `FieldChange` for field "foo" carrying the revision foo
-   A `NodeChangeset.valueChange` carrying the revision bar
