# @fluid-experimental/tree

**Important: this DDS is no longer in active development.**
**As of Fluid Framework's 2.0 release, a production ready tree DDS is available via [@fluidframework/tree](https://github.com/microsoft/FluidFramework/tree/main/packages/dds/tree).**
**Please use that library instead.**

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-experimental/tree
```

## API Documentation

API documentation for **@fluid-experimental/tree** is available at <https://fluidframework.com/docs/apis/tree>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

A [Fluid](https://fluidframework.com/) SharedObject Tree with:

-   Transactional editing and snapshot isolation
-   Strong node identities
-   High quality automatic merge resolution
-   A flexible operation set that includes Move
-   History inspection, manipulation and metadata

Revisions of the tree (see [EditLog](./src/EditLog.ts) and [TreeView](./src/TreeView.ts)) are created from sequences of Edits.

Semantically, the current state of the tree is defined as:

The [initial tree](./src/InitialTree.ts), modified by all edits in order.

The order of the edits is:

1. All acknowledged edits, in the order agreed upon by Fluid's consensus.
2. All local edits (not acknowledged by Fluid yet), in the order they were applied.


# Getting Started

## Tree Abstraction

The tree abstraction used for `SharedTree` is composed of nodes with four main attributes: a _definition_, an _identity_, zero or more _traits_, and an optional _payload_ to contain arbitrary serializable data.

### Definition

The definition of a node conveys the node's semantic meaning. It is typically used to associate the node with metadata such as a schema for what this tree represents.

### Identifier

A node's identifier is a unique key associated with that node. The identifier can be used to retrieve a node from the current view of a SharedTree, and provides a way to refer to existing nodes when performing edits to the tree.

### Traits

Traits are sequences of child nodes underneath a parent node. Each trait is identified by a label and may contain one or more children. Organizing a node's children underneath traits (rather than in a single freeform list, as many trees do) allows more intuitive construction of documents.

```typescript
// A parent node with three traits, labelled "name", "employees" and "products"
{
	definition: 'Company',
	identifier: 42,
	traits: {
		name: [{...}] // Traits may contain just one child node...
		employees: [{...}, {...}, {...}], // ...or many children
		products: [{...}, {...}]
	}
}
```

### Payload

The payload of a node is a bag of arbitrary state with only one requirement: it must be JSON-serializable. Payloads allow the tree to store data that can't be efficiently encoded by nodes themselves (for example, strings or numbers)

## Example Tree

Consider a document which consists of the point (4, 9) in 2-dimensional space. One way this document could be encoded into the tree format expected by a `SharedTree` might look like this:

```typescript
// These definitions conceptually refer to *all* points/numbers in existence.
const pointDefinition = '3781c3b1-41e6-43c5-9ffd-13916071d4dc';
const numberDefinition = '3e5a1652-983f-4533-bb59-130ac8f3714e';

// These identifiers refer to *the particular* point/number nodes in the tree below.
const pointIdentifier = 100;
const xIdentifier = 101;
const yIdentifier = 102;

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

Note that this example isn't meant to be taken verbatim as valid code -- it cheats a bit with payload representation for the sake of simplicity, and isn't validly constructing the node's identifiers. It is, however, truthful to tree structure.

## Creating a SharedTree

SharedTree follows typical [Fluid DDS conventions](https://fluidframework.com/docs/) and can be constructed with a Fluid runtime instance:

```typescript
const tree = SharedTree.create(runtime);
```

Upon creation, the tree will contain a single node: the [initialTree](./src/InitialTree.ts). All SharedTrees begin with this initial node as their root node, which cannot be deleted or moved. It provides an anchor for new nodes to be inserted underneath it.

## Reading

SharedTree provides [TreeView](./src/TreeView.ts)s which are immutable snapshots of the tree at a given revision. These views can be generated for the current (i.e. the most up-to-date after applying all known edits) state of the tree, or can be created for the state of the tree after a specific revision in the tree's history of edits.

### Reading the current state of the tree

The `currentView` property on SharedTree is the easiest way to get the view of the latest revision.

```typescript
function getChildrenUnderTrait(sharedTree: SharedTree, parentId: NodeId, traitLabel: TraitLabel): TreeViewNode[] {
	// Get the most up-to-date view of the tree at this moment.
	const view = sharedTree.currentView;
	// Get the IDs of children in some trait with `getTrait`:
	const childIds = view.getTrait({ label: traitLabel, parent: parentId });
	// Get the node for a given ID with `getViewNode`:
	return childIds.map((id) => view.getViewNode(id));
}
```

> Note that `view` will never change, even if the shared tree applies or receives more edits. If you want the updated view after additional edits happen, you must call `sharedTree.currentView` again.

### Reading an arbitrary revision of the tree

If you want to inspect the tree at some state prior to the current view, SharedTree provides a [LogViewer](./src/LogViewer.ts) to obtain views at a specific revision.

```typescript
function getViewAfterEdit(sharedTree: SharedTree, editId: EditId): TreeView {
	// First, find which revision corresponds to a given edit
	const revision = sharedTree.edits.getIndexOfId(editId);
	// Then, ask the logViewer to create a view at that specific revision
	return sharedTree.logViewer.getRevisionViewInSession(revision);
}
```

### Listening to changes to the tree

SharedTree exposes an `EditCommitted` event which fires whenever local or remote edits are applied to the tree. Beware! This API has a severe pitfall. It is not guaranteed that the edit provided by `EditCommitted` is the most recent edit in the tree's edit log. This is because local edits are always considered to be most recent in the log, but there might be remote edits from other clients which are _sequenced before_ but _discovered after_ the local edits. Therefore, code which is using the `EditId` of the edit provided by `EditCommitted` to query the `LogViewer` requires very careful attention and is prone to bugs.

You are _strongly_ encouraged to use a `Checkout` instead which provides a cleaner and safer API for listening to changes to the tree. See "Use a Checkout" below for more information.

## Editing

For simple edits (ones in which transactionality isn't important), `SharedTree` provides convenient, imperative APIs along the following lines:

```typescript
const view = sharedTree.currentView;
sharedTree.applyEdit(Change.insertTree(fooNode, StablePlace.atStartOf({ parent: view.root, label: 'foo' }));
sharedTree.applyEdit(Change.move(barNode, StablePlace.after(fooNode.identifier)));
```

This would insert `fooNode` at the start of the "foo" trait underneath the root node, and move `barNode` from wherever it is in the tree to after the `foodNode` in the "foo" trait.
Each operation would be performed in its own `Edit`, which is `SharedTree`'s transactional atom (one revision corresponds to one edit).

An `Edit` is the basic unit of transactionality in `SharedTree`. It specifies how to modify a document via a sequence of changes (see [ChangeTypes](./src/ChangeTypes.ts)). Each edit, when applied to a version of the document (a TreeView), produces a new version of the document.

Once an edit is acknowledged by the Fluid service (and thus it has a sequence number, and will be included in summaries), the version of the document it applies to is fixed: it will not be applied to any revision other than the one produced by its preceding edit. There may be operations that will create new edits based on existing ones and apply them in a different context (e.g. undo), but these are logically considered new edits.

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

### Change Atomicity

One or both of the above calls to `tree.applyEdit ` could fail to apply. It may be desirable to group changes to the tree such that all the changes are successful and apply at once, or in the case that any of them fail, none of them apply. There are three approaches available to accomplish this.

#### Apply all changes together

The two edits above can simply have their changes concatenated into a single edit.

```typescript
sharedTree.applyEdit([
	...Change.insertTree(fooNode, StablePlace.atStartOf({ parent: view.root, label: 'foo' }),
	...Change.move(barNode, StablePlace.after(fooNode.identifier))
]);
```

#### Use a Transaction

The above approach is only possible once all the changes are known. A client may instead wish to build up a sequence of changes over time and observe their affects on the view, but wait until later to submit them in an edit. A [Transaction](./src/Transaction.ts) is a lightweight tool to accomplish this.

```typescript
const transaction = new Transaction(sharedTree);
transaction.apply(Change.insertTree(fooNode, StablePlace.atStartOf({ parent: view.root, label: 'foo' }));
const viewAfterFirstEdit = transaction.currentView; // This is the view after applying the above change. It is not the current view of the SharedTree (which has not had the above change applied).
transaction.apply(Change.move(barNode, StablePlace.after(fooNode.identifier)));
transaction.closeAndCommit(); // If all changes were successful, this will apply them together as a single edit to the SharedTree. The transaction is now "closed" and any future changes will be ignored.
```

> If any changes applied to a transaction fail, the transaction will automatically close.

#### Use a Checkout

A [Checkout](./src/Checkout.ts) is similar to a `Transaction` in that it applies changes over time, but it has some additional features:

-   Multiple edits can be submitted over the lifetime of a single `Checkout`.

    ```typescript
    const checkout = new EagerCheckout(sharedTree);
    checkout.openEdit();
    checkout.applyChanges(Change.insertTree(fooNode, StablePlace.atStartOf({ parent: initialTree, label: 'foo' })));
    checkout.applyChanges(Change.move(barNode, StablePlace.after(fooNode.identifier)));
    checkout.closeEdit(); // This submits the changes to the tree in an edit
    checkout.openEdit();
    checkout.applyChanges(Change.delete(barNode.identifier));
    checkout.closeEdit(); // This submits another edit to the tree
    ```

    > If a change failed to apply, `closeEdit` will throw an error. Detect this case by checking `getEditStatus` and calling `abortEdit` instead.

-   Checkouts can rebase an edit in progress.

    ```typescript
    const checkout = new EagerCheckout(sharedTree);
    checkout.openEdit();
    checkout.applyChanges(Change.insertTree(fooNode, StablePlace.atStartOf({ parent: initialTree, label: 'foo' })));
    // ... Edits are applied to the tree (e.g. by other clients)
    checkout.rebaseCurrentEdit(); // Rebases the current changes in this edit to the SharedTree's current view.
    checkout.applyChanges(Change.move(barNode, StablePlace.after(fooNode.identifier)));
    checkout.closeEdit(); // This submits the changes to the tree in an edit
    ```

-   Checkout implementations can choose how often they synchronize their view with the underlying `SharedTree` when not in an edit (i.e. snapshot isolated). If you want to synchronize as frequently as possible (this is likely), use `EagerCheckout`. If you prefer to control the cadence for synchronization, `LazyCheckout` can manage this through `Checkout.waitForPendingUpdates`. Clients may implement their own checkout if a more complicated policy is desirable.

-   Checkouts provide the `viewChange` event: a convenient API for observing changes to the Checkout's `currentView`. Clients are expected to subscribe to the `viewChange` event and update their application accordingly whenever a `viewChange` happens. This is almost always desirable over the lower-level `SharedTree.EditCommitted` event because it lets app authors respond directly to changes to the content of the tree, rather than needing to be aware of the underlying edits that caused the changes. For most applications, the `viewChange` event "just works", because it follows special rules regarding when to fire. `viewChange` is fired under the following circumstances:

    -   If there is **not** an ongoing edit for this checkout (i.e. not between `openEdit()` and `closeEdit()`), `viewChange` is fired...
        -   when an edit is applied directly to the _Checkout_ by the local client
        -   by `EagerCheckout` when an edit is applied to the _SharedTree_ by the local or a remote client
        -   by `LazyCheckout` when `waitForPendingUpdates()` is called and there are outstanding edits to the tree from the local or a remote client
    -   If there **is** an ongoing edit for this checkout, `viewChange` is fired...
        -   when a change is applied to the ongoing edit in the checkout
        -   when the ongoing edit is rebased via `rebaseCurrentEdit()`

    This policy may seem complicated at first glance, but in practice it provides a natural flow. Checkouts always notify listeners of changes that are applied directly to the checkout itself, but changes from outside the checkout (e.g. from a remote client) are buffered according to the checkout's policy. `EagerCheckout` doesn't buffer them at all and fires a change event right away, whereas `LazyCheckout` avoids firing a change event until asked (via `waitForPendingUpdates()`). Note that every kind of checkout provides [snapshot isolation](https://en.wikipedia.org/wiki/Snapshot_isolation), meaning that while the checkout is in the middle of an edit (i.e. between `openEdit()` and `closeEdit()`) it will not fire an event for changes coming from outside of the Checkout. This is desirable because it prevents the view from changing "out from under" the current edit that is being built.

    The `viewChange` event also provides the previous view as well as the new view, which allows clients to generate a delta of the two views if they desire:

    ```typescript
    const checkout = new EagerCheckout(sharedTree);
    checkout.on('viewChange', (before: TreeView, after: TreeView) => {
    	// Use the delta object as a convenient way to see which nodes were added, deleted, or changed between views
    	const delta = before.delta(after);
    }));

    ```

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

When a change fails to apply, or a constraint indicates that it applied, but may not have been ideal, it is called conflicted. Currently, if a change fails to apply due to a conflict, it is dropped.

### Constraints

> Constraints are mostly unsupported at this time. They will be supported in the upcoming SharedTree v2 implementation.

A `Constraint` can be added to an Edit's list of changes which can be used to detect cases where an Edit could still apply (not-conflict) but may lose its original semantics due to reordering.

For example, two edits could be made concurrently: one that sorts a list alphabetically and one that adds an item to the list.
Depending on how the sorting structures its changes and exactly where the insert occurred, the sort may or may not conflict if the insert gets acknowledged first.
In some domains, it would be desired that this conflicts.
In such domains, a Constraint could be added that would require the list to contain the same set of items as when the sort edit was created for it to apply correctly.
The Constraint can specify what should happen if violated: see `ConstraintEffect` in [persisted-types](./src/persisted-types/0.0.2.ts) for details.

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

# Undo/Redo

Undo in a collaborative context is complex since the change being undone may not be the most recent change.
This means undo and redo really need to be treated as arbitrary history edits, adding and removing changes as specific points in the past, and reconciling the impact of that with the edits after it. Both `SharedTree` and `Checkout` expose `revert` as a method to revert arbitrary edits.

```typescript
const editId = sharedTree.applyEdit(Change.insertTree(fooNode, StablePlace.atStartOf({ parent: view.root, label: 'foo' }));
const undoEditId = sharedTree.revert(editId); // Undoes the insert
const redoEditId = sharedTree.revert(undoEditId); // Redoes the insert
```

## Summaries

### History

A `SharedTree` can optionally preserve its "history", i.e. all edits that were sequenced over time. This has storage and performance overhead, and is disabled by default. An instance of a SharedTree object will always contain all edits that were created/received during its lifetime, thus enabling undo, redo and history traversal of those edits.

> Currently, `SharedTree` documents created with history enabled can never have their history removed.

### History Virtualization

The summaries generated by SharedTree include the current view and edit history. However, new clients that load the summary can be used with the current view alone. This allows the history to be virtualized to decrease load time of clients for large edit histories.

Edits are virtualized and downloaded on-demand via async APIs. The usage of edit history is rare outside of history-related operations and therefore, it is not expected that clients will be frequently downloading edit history. Devirtualized edits are also cached and periodically evicted from memory, however, edits added to the history during the current session are never evicted.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Minimum Client Requirements

These are the platform requirements for the current version of Fluid Framework Client Packages.
These requirements err on the side of being too strict since within a major version they can be relaxed over time, but not made stricter.
For Long Term Support (LTS) versions this can require supporting these platforms for several years.

It is likely that other configurations will work, but they are not supported: if they stop working, we do not consider that a bug.
If you would benefit from support for something not listed here, file an issue and the product team will evaluate your request.
When making such a request please include if the configuration already works (and thus the request is just that it becomes officially supported), or if changes are required to get it working.

### Supported Runtimes

-   NodeJs ^20.10.0 except that we will drop support for it [when NodeJs 20 loses its upstream support on 2026-04-30](https://github.com/nodejs/release#release-schedule), and will support a newer LTS version of NodeJS (22) at least 1 year before 20 is end-of-life. This same policy applies to NodeJS 22 when it is end of life (2027-04-30).
-   Running Fluid in a Node.js environment with the `--no-experimental-fetch` flag is no longer supported.
-   Modern browsers supporting the es2022 standard library: in response to asks we can add explicit support for using babel to polyfill to target specific standards or runtimes (meaning we can avoid/remove use of things that don't polyfill robustly, but otherwise target modern standards).

### Supported Tools

-   TypeScript 5.4:
    -   All [`strict`](https://www.typescriptlang.org/tsconfig) options are supported.
    -   [`strictNullChecks`](https://www.typescriptlang.org/tsconfig) is required.
    -   [Configuration options deprecated in 5.0](https://github.com/microsoft/TypeScript/issues/51909) are not supported.
    -   `exactOptionalPropertyTypes` is currently not fully supported.
        If used, narrowing members of Fluid Framework types types using `in`, `Reflect.has`, `Object.hasOwn` or `Object.prototype.hasOwnProperty` should be avoided as they may incorrectly exclude `undefined` from the possible values in some cases.
-   [webpack](https://webpack.js.org/) 5
    -   We are not intending to be prescriptive about what bundler to use.
        Other bundlers which can handle ES Modules should work, but webpack is the only one we actively test.

### Module Resolution

[`Node16`, `NodeNext`, or `Bundler`](https://www.typescriptlang.org/tsconfig#moduleResolution) resolution should be used with TypeScript compilerOptions to follow the [Node.js v12+ ESM Resolution and Loading algorithm](https://nodejs.github.io/nodejs.dev/en/api/v20/esm/#resolution-and-loading-algorithm).
Node10 resolution is not supported as it does not support Fluid Framework's API structuring pattern that is used to distinguish stable APIs from those that are in development.

### Module Formats

-   ES Modules:
    ES Modules are the preferred way to consume our client packages (including in NodeJs) and consuming our client packages from ES Modules is fully supported.
-   CommonJs:
    Consuming our client packages as CommonJs is supported only in NodeJS and only for the cases listed below.
    This is done to accommodate some workflows without good ES Module support.
    If you have a workflow you would like included in this list, file an issue.
    Once this list of workflows motivating CommonJS support is empty, we may drop support for CommonJS one year after notice of the change is posted here.

    -   Testing with Jest (which lacks [stable ESM support](https://jestjs.io/docs/ecmascript-modules) due to [unstable APIs in NodeJs](https://github.com/nodejs/node/issues/37648))

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
