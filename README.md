# Shared Tree

A [Fluid](https://fluidframework.com/) SharedObject Tree with:

-   Transactional editing
-   Strong node identities
-   High quality automatic merge resolution
-   Full History Inspection, Manipulation and Metadata

Revisions of the tree (see [EditLog](.\src\EditLog.ts) and [TreeView](.\src\TreeView.ts)) are created from sequences of Edits.

Semantically, the current state of the tree is defined as:

The initial tree, modified by all edits in order.

The order of the edits is:

1. All acknowledged edits, in the order agreed upon by Fluid's consensus.
2. All local edits (not acknowledged by Fluid yet), in the order they were created.

# Getting Started

## Tree Abstraction

The tree abstraction used for `SharedTree` is summarized by the [TreeNode](./src/generic/PersistedTypes.ts) class. Nodes have _traits_, a _definition_, an _identity_, and optionally a payload to contain extra arbitrary data.

### Definition

The definition of a node provides the node's meaning. It is typically used to associate the node with metadata such as a schema for what this tree represents.

### Identifier

A node's identifier is a globally unique way to refer to it. This enables collaborative editing specifications by ensuring that each element of a document can be identified.

### Traits

Traits are what give a node the structure of a tree. Intuitively, a trait is a named sequence of content nodes. Organizing a node's children underneath traits (rather than in a freeform list, as many trees do) allows more natural construction of documents.

### Example

Consider a document which consists of the point (4, 9) in 2-dimensional space. One way this document could be encoded into the tree format expected by a `SharedTree` might look like this:

```typescript
// These definitions conceptually refer to *all* points/numbers in existence.
const pointDefinition = '3781c3b1-41e6-43c5-9ffd-13916071d4dc';
const numberDefinition = '3e5a1652-983f-4533-bb59-130ac8f3714e';

// These identifiers refer to *the particular* point/number nodes in the tree below.
const pointIdentifier = '668b4277-ed5b-41f6-90ce-d2f666a59e41';
const xIdentifier = 'f067342f-5307-460e-a67a-41d2448231f3';
const yIdentifier = '6a23b443-8735-4c1d-8f88-3aca5ba07939';

const pointDocument: Node = {
	definition: pointDefinition
	identifier: pointIdentifier,
	traits: {
		x: {
			definition: numberDefinition,
			identifier: xIdentifier,
			payload: 4
		},
		y: {
			definition: numberDefinition,
			identifier: yIdentifier,
			payload: 9
		}
	}
};
```

Note that this example isn't meant to be taken verbatim as valid code -- it cheats a bit with payload representation for the sake of simplicity. It is, however, truthful to tree structure.

## Creating a SharedTree

SharedTree follows typical [Fluid DDS conventions](https://fluidframework.com/docs/) and can be constructed with a Fluid runtime instance:

```typescript
const tree = SharedTree.create(runtime);
```

Upon creation, the tree will contain a single node: `initialTree`.

## Editing

For simple edits (ones in which transactionality isn't important), `SharedTree` provides convenient, imperative APIs along the following lines:

```typescript
tree.editor.insert(fooNode, StablePlace.atStartOf({ parent: initialTree.identifier, label: 'foo' }));
tree.editor.insert(barNode, StablePlace.atStartOf({ parent: initialTree.identifier, label: 'bar' }));
```

This would insert `fooNode` at the start of the "foo" trait underneath the initial tree's root node, and `barNode` underneath the "bar" trait.
Each operation would be performed in its own `Edit`, which is `SharedTree`'s transactional atom.

If it is undesirable that one of the above operations could fail to apply while the other could succeed, you should instead leverage `Checkout`. A `Checkout`--whose name is inspired from source control--can be thought of as a local view of the `SharedTree` which provides [snapshot isolation](https://en.wikipedia.org/wiki/Snapshot_isolation#:~:text=In%20databases%2C%20and%20transaction%20processing,the%20transaction%20itself%20will%20successfully). Editing the `SharedTree` using a `Checkout` can be done by opening an edit, applying a number of changes, and closing the edit.

```typescript
const checkout = new BasicCheckout(tree);
checkout.openEdit();
checkout.applyChanges(Insert.create([fooNode], StablePlace.atStartOf({ parent: initialTree, label: 'foo' })));
checkout.applyChanges(Insert.create([barNode], StablePlace.atStartOf({ parent: initialTree, label: 'bar' })));
checkout.closeEdit();
```

"Move" and "delete" operations have the added complexity of needing to specify locations (`StableRange`s) within the `SharedTree` which should be moved (or deleted, respectively). A `StableRange` consists of a start `StablePlace` and an end `StablePlace`.
`StablePlace`s are not nodes, but instead places where nodes could be inserted. Each place consists of an "anchor," which is either a trait or another node.

Say we wanted to delete the `fooNode` we inserted above. There are 4 ways we could specify the `StableRange` to delete which are all equivalent in the absence of concurrent editing:

```typescript
const trait = { parent: initialTree, label: 'foo' };
const stableRange1 = StableRange.from(StablePlace.atStartOf(trait)).to(StablePlace.atEndOf(trait));
const stableRange2 = StableRange.from(StablePlace.atStartOf(trait)).to(StablePlace.after(fooNode));
const stableRange3 = StableRange.from(StablePlace.before(fooNode)).to(StablePlace.atEndOf(trait));
const stableRange4 = StableRange.from(StablePlace.before(fooNode)).to(StablePlace.after(fooNode));
```

Once concurrent edits are considered, the different ways to anchor this `StableRange` may impact whether or not this edit conflicts with others.

Also note that there are some more convenient shorthands for several of these specifications. See `StableRange` documentation for more information.

# Status

SharedTree is in active, but still relatively early development. As such, it is lacking in some areas (such as performance testing). For an idea of some future features we'd like to support, see [Future Plans](./docs/Future.md).

Implementation-wise:

-   Document format may change only in major releases, and SharedTree is committed to backwards compatibility (support for older documents). For more information on this commitment, see the notes in [PersistedTypes.ts](./src/generic/PersistedTypes.ts).
-   APIs are not yet stable, and those beyond what's needed for the MVP (ex: history editing and inspection) are not provided yet. Core APIs are not likely to significantly change.
-   Performance is generally reasonable. However, this assessment was made using integration-style performance tests of consuming applications. Though it's on the road-map, there are currently no rigorous performance tests which are isolated to SharedTree.

Design wise:

-   SharedTree is always created with an uninitialized state. It is up to the application to initialize the tree to something else if needed.
-   There are still open questions regarding how SharedTree will relate to the rest of the Fluid ecosystem.
    For example, we do not have suggested design patterns for when users of SharedTree should store references to other Fluid DataObjects versus storing the data for children as subtrees.

# Edits

An `Edit` is the basic unit of transactionality in `SharedTree`. It specifies how to modify a document via a sequence of changes (see [PersistedTypes.ts](.\src\generic\PersistedTypes.ts)). Each edit, when applied to a version of the document (a TreeView), produces a new version of the document.

Once an edit is acknowledged by the Fluid service (and thus it has a sequence number, and will be included in summaries), the version of the document it applies to is fixed: it will not be applied to any revision other than the one produced by its preceding edit.
There may be operations that will create new edits based on existing ones and apply them in a different context, but these are logically considered new edits.

## Conflicts

Due to the collaborative and distributed nature of SharedTree,
Edits may be constructed based on a version of the tree that differs from the one they end up getting applied to.
The Change API is designed to allow capturing a lot of the actual intention of edits in the Change.
For example, an Insert between A and B can be anchored after A or before B.
If it is really intended to be between A and B, a Constraint can be included that requires A and B are still next to each-other or the edit will conflict.
It is also possible to replace the contents between A and B with the inserted content.
This flexibility allows the majority of edits to be encoded in a way where their intention will be applied correctly when reordered,
and in the rare cases where this can not be done, they will conflict instead of being applied in a non-intention preserving way:
SharedTree generally follows this policy that it is better to fail to apply a change than to apply it in a way that violates user expectation or intention.

When a change fails to apply, or a constraint indicates that it applied, but may not have been ideal, it is called conflicted. Currently, if a change fails to apply due to a conflict, it is dropped. Improving this policy is in our [future plans](./docs/Future.md).

### Constraints

A `Constraint` can be added to an Edit's list of changes which can be used to detect cases where an Edit could still apply (not-conflict) but may lose its original semantics due to reordering.

For example, two edits could be made concurrently: one that sorts a list alphabetically and one that adds an item to the list.
Depending on how the sorting structures its changes and exactly where the insert occurred, the sort may or may not conflict if the insert gets acknowledged first.
In some domains, it would be desired that this conflicts.
In such domains, a Constraint could be added that would require the list to contain the same set of items as when the sort edit was created for it to apply correctly.
The Constraint can specify what should happen if violated: see `ConstraintEffect` in [PersistedTypes.ts](.\src\default-edits\PersistedTypes.ts) for details.

Note that these constraints apply to more than just the case of edits that were made concurrently:
edits to history also use conflicts (and thus constraints) to prevent historical edits from being re-contextualized in ways that break their semantics.
In the above example, this could occur when a user undoes deleting an item from the list after it was sorted.
If the sort has a constraint that the list contains the expected items, the undo will violate that constraint
(making it not commute with the sort, even if the list was already mostly or fully sorted).
This gives the application the opportunity to resolve the constraint violation by reapplying the sort on the updated list when performing the undo,
and thus maintain the expected behavior that the new item (whose delete was undone) will show up sorted correctly.
See the "Editing History" section below for details on how this works.

### Change Rejection

In scenarios where concurrent changes occur, it is possible that the order in which the Fluid service acknowledges these changes causes a change to become invalid.
Edits are transactional so any invalid change in an edit will cause the entire edit to be invalid.

However, no combination of changes will cause the client to crash.
Changes go through validation before they are applied and invalid changes are currently dropped.

#### Change Rejection Example

Assuming a tree with a single node, A, a client creates an edit, 1, that inserts a node after node A.
At the same time another client creates an edit, 2, that deletes node A.
If the Fluid service sequences edit 2 before edit 1, edit will then becomes invalid because its anchor has been deleted.
In this situation, edit 1 is dropped.

#### Possible Change/Edit Results

|                  |                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applied          | The edit or change was applied.                                                                                                                                                                 |
| Invalid Change   | A well-formed (not malformed) change which cannot be applied given the current tree and detached state.                                                                                         |
| Invalid Edit     | A well-formed edit which cannot be applied to the current tree.                                                                                                                                 |
| Malformed Change | A change which can not possibly be applied to any tree without error. For example, a StablePlace with no sibling and also no trait.                                                             |
| Malformed Edit   | An edit which contains one or more malformed changes, or an edit with a sequence of changes that could not possibly be applied sequentially without error. (e.g. parent a detached node twice). |

# Undo

Undo in a collaborative context is complex since the change being undone may not be the most recent change.
This means undo and redo really need to be treated as arbitrary history edits, adding and removing changes as specific points in the past, and reconciling the impact of that with the edits after it.

## Summaries

### History Virtualization

The summaries generated by SharedTree include the current view and edit history. However, new clients that load the summary can be used with the current view alone. This allows the history to be virtualized to decrease load time of clients for large edit histories.

Edits are virtualized and downloaded on-demand via async APIs. The usage of edit history is rare outside of history-related operations and therefore, it is not expected that clients will be frequently downloading edit history. Devirtualized edits are also cached and periodically evicted from memory, however, edits added to the history during the current session are never evicted.
