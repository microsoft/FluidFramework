# The Cell Model of Collaborative Editing

This document presents a conceptual model that provides a foundation upon which the semantics of SharedTree editing can be understood.

The model itself is not tied to SharedTree or SharedTree's data model.
It is instead concerned with providing an abstraction for what it means to edit a document.

The model only concerns itself with the editing of a single field.
More complex structures (notably, trees) can be constructed by allowing the contents of the field to represent more fields.

## Summary

Previously we were trying to build the notion of tree locations (anchors) on top of nodes that are moving and popping in/out of existence.

It's simpler to start with a foundation of tree locations (cells) that never move/disappear, and then layer the idea of moveable/removable nodes on top of that.

The impedance mismatch between our internal model and the semantics desired by users was making things unnecessarily complicated: forcing the internal model to be excessively general, and then requiring higher layers to compensate.
The primary example being the use of constraints and/or hierarchical edits to constrain the semantics of insert/remove to fit the desired semantics of setting a fixed-sized field.

## Motivation

We present here an example that portrays the challenges encountered by editing models based on insertion and removal.

Consider a collaborative editing session between three participants (all acting concurrently), over a field populated with elements [A, B, C, D], where the edits are sequenced as follows:

1. User 1: remove B, C (local state: [A, D])

2. User 2: insert Y after C (local state: [A, B, C, Y, D])

3. User 3: insert X after B (local state: [A, B, X, C, D])

4. User 1: undo the removal of B, C (local state: [A, B, C, D])

The outcome we expect from such a session is [A, B, X, C, Y, D].

Traditional models based on insertion and removal may fail to produce this outcome in two ways:

-   The order of X relative to Y may not be correct (i.e., Y may appear before X in the list of elements).

-   The order the inserted element relative to the temporarily removed elements may not be correct (yielding either [A, X, Y, B, C, D] or [A, B, C, X, Y, D]).

The first failure stems from the fact that, as the insertion of X and Y are made relative to removed content, information is lost as to their precise insertion point.

The second failure stems from the fact that the undo of the removal of B, C by user 1 is modeled as an insertion.

This second failure can also occur when elements are moved-out and the move is then undone (and the undo is modeled as a move in the opposite direction).

These failures can be addressed by introducing new features:

-   Tombstones, which represent removed or moved-out elements

-   The "revive" operation which restores elements in the place of their tombstones

-   The "return" operation which moves elements back in the place of their tombstone.

These additions, while effective, have the following drawbacks:

-   They increase the complexity of the core editing model

-   They lead to a set of operations that is not orthogonalized:

    -   Insert, revive, and return seem to share some common traits, with revive and return being closer to each other.

    -   It seems like it should be possible to support a "replace" operation that is similar to revive but with new elements instead of resurrecting removed ones, but that too needs to be added as separate operation)

*   They do not alleviate the complexity of modeling an optional field (clearing the field requires a slice-delete operation over the field, overwriting the field requires that same slice-delete and an insert whose exact position is meaningless).

The cell model can be thought of as a refactoring of both the traditional editing primitives and the above additions such that the listed drawbacks are avoided.

## The Model

### Fields

In this model, a field is a possibly empty sequence of cells.
The sequence makes cells totally ordered.
It is this ordering which serves as the foundation upon which the appropriate ordering of content is ensured.

### Cells

In this model, a cell is a unit of storage.
A cell cannot be subdivided.
It may either be empty or full.
The contents of a (full) cell may be arbitrarily large or small (though a specific data model may constrain this in practice).

> Note: the model does not prescribe for the cells to be explicitly reified.
> While some cells may be represented at runtime some of the time, they are primarily a conceptual artefact.
> An application would not have explicit access to the cell, and is likely not aware of the concept in the first place.

A cell may be annotated with forwarding information that specifies a target destination cell.
A single cell may bear any number of such forwarding annotations.
This forwarding information is used to represent move information: the source cell is annotated with forwarding information that points to the destination cell.

In addition to their storage role, cells act as markers relative to which an edit may be performed (e.g., "Before/after cell foo").

### Operations

The model admits the following operations:

> WIP: An alternative set of operations based on hiding cells instead of clearing them is being considered.
> The general structure of the model is unaffected.

-   <u>Allocate</u> a new cell at a specific location in the sequence

-   <u>Fill</u> a cell with content (overwriting existing content if any)

-   <u>Clear</u> content from a cell, leaving it empty

-   <u>Add a forwarding annotation</u> to a cell

-   <u>Remove a forwarding annotation</u> from a cell

Note that cells cannot be deallocated (or moved).
This reflects the fact that a client may perform an edit relative to some content's location at a point in time, even if that content has since been deleted or moved: the client is performing the edit relative to the cell which contained that content.

## Building on the Model

The model can be used to describe low-level edits that a client may perform on a field in a collaborative environment and by so doing imply some of their merge semantics.

We provide here two lists of such low-level edits, one for fields whose number of cells is fixed, and one for fields whose number of cells is dynamic.

Note that the fixed and dynamic characteristics here apply only to the number of cells, not to the number of elements.
For example, an optional field, which can contain zero or one element, is a fixed-sized field composed of exactly one cell.
That cell exists even when the field is not populated with an element.

The dichotomy has no basis in the cell model but reflects what we think is a sensible separation and matches industry-standard patterns of editing.

### Edits on Dynamically-Sized Fields

Dynamically-sized fields can be thought of as having list-like behavior: elements can be added anywhere in the list and removed at will which makes the list contents dynamically grow and shrink (while the number of cells in the list only grows).
Dynamically-sized fields typically start out empty of any cell.

The low-level edits that such fields might support can be decomposed as follows:

-   Insert: allocate and fill a cell

-   Delete/Remove: clear a cell

-   Revive: fill a (cleared) cell with the contents it contained before

-   Replace: fill a (filled) cell

-   Move content from A to B:

    -   A: clear a (filled) cell and add a forwarding annotation to it

    -   B: allocate and fill a cell with the content being moved

-   Return content to A from B:

    -   A: remove the forwarding annotation from a cell and fill it with the returned content

    -   B: clear the (filled) cell

### Edits on Fixed-Sized Fields

Fixed-sized fields can be used to model required (i.e., unary) fields, optional fields, fixed-sized arrays (not to be confused with JavaScript arrays which behave like dynamically-sized lists), and tuples.
Fixed-sized fields are populated with their cells (and possibly content) from the time they are created.

The low-level edits that such fields might support can be decomposed as follows:

-   Upsert: fill a (potentially empty) cell

-   Populate if empty: fill a cell if the cell is empty

-   Load-linked store: fill a cell if the cell has not been concurrently filled or cleared

-   Clear: clear a cell

-   Move content from A to B:

    -   A: clear a (filled) cell

    -   B: fill a cell with the content being moved

-   Return content to A from B:

    -   A: fill a cell with the content being moved

    -   B: clear the (filled) cell

The Move/Return operations described here assume both the source and the destination of the move are in the same kind of trait. This is not a requirement, though some combinations may be questionable.

Note that no further cell allocations are made after the field is created.

## Implications For SharedTree

### Data Model

The SharedTree data model should differentiate between fixed-sized and dynamically-sized fields.
Users of SharedTree, when writing a schema, implicitly choose whether to use fixed-size or dynamically-sized field.
This is not a new choice (they're still choosing from the same set of options) but their choice is now reflected at the data model level.

### Editing API

New editing operations need to be exposed for fixed-sized fields.

The editing operations offered by SharedTree, even for unschematized data, need not be the ones prescribed by the model.
Instead, we see value in offering two sets of higher-level operations: one for fixed-sized fields and one for dynamically-sized fields.
This allows the editing API to be more specialized for each kind of field, which in turn allows the API to be more expressive and more familiar.

### Merge Semantics

The merge resolution logic can now exclude the possibility of having to merge operations from both sets within a single field (outside of schema migration scenarios).

Since the merge resolution logic is specialized to each field kind, merge resolution logic becomes extensible: we can introduce new kind of fields with associated merge logic.
This allows us to support new kinds of fields in the future, but more importantly it means that we can migrate from a less desirable set of merge semantics to a more desirable one.
This dramatically reduces the negative impact of starting out with suboptimal the merge semantics in early SharedTree releases because we can implement better ones later on and offer them as new kinds of fields.

### Changeset Format

The changeset format should not be forced to adopt the primitive operations defined by the model as this would likely lead to bloat (such as specifying both "allocate" and "fill" for the insert edit).

The changeset format may however be constructed in such a way that it could be translated to the primitive operations defined by the model.

The changeset format also needs to represent the new kind of edits supported by fixed-sized fields.

### Change Application Logic

While there is no imperative to do so, the change application logic of SharedTree, as an implementation detail, may be factored in a way that resembles the primitive operations defined by the format.

### Cost of Tombstone Data

By allowing some usage patterns to leverage fixed-sized fields, we are able to offer adequate merge semantics without incurring the cost of managing a potentially unbounded number of tombstones.
This is particularly welcome because we conjecture that fixed-sized fields are more likely to see a lot of repeated overwrites.
Dynamically sized fields typically contain more data, but the amount of deleted content tends to remain proportional to the amount of tip-state content.
