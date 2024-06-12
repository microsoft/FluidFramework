---
"@fluidframework/tree": major
---

Implement compatibility-based schema evolution API

This change adjusts some top-level APIs for using SharedTree to better accommodate applications that need to change their schema.
These changes enable forwards compatibility with future work to relax `SharedTree`'s restrictions around view schema and stored schema compatibility.
That future work will enable more flexible policies around how applications can update their documents' schemas over time.

Application authors are encouraged to develop a compatibility policy which they are comfortable with using the guidance in the
"Schema Evolvability" section of `@fluidframework/tree`'s readme.

To make the details of schema compatibilities that SharedTree supports more clear,
`TreeView.error` has been functionally replaced with the `compatibility` property.
Users desiring the previous strict behavior should use `view.compatibility.isEquivalent` at appropriate places in application logic.

# `ITree.schematize` deprecation

`ITree.schematize` has been deprecated in favor of `ITree.viewWith`.
Unlike `schematize`, `viewWith` does not implicitly initialize the document.
As such, it doesn't take an `initialTree` property.
Instead, applications should initialize their trees in document creation codepaths using the added `TreeView.initialize` API.

## Old

As an example, something like the following code may have been used before for both the document create and document load codepaths:

```typescript
// -- fluid-framework API for statically defined objects in container schema --
const tree = container.initialObjects.myTree;
const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));

// -- fluid-framework API for dynamically created objects --
const tree = await container.create(SharedTree);
const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));
```

When using the encapsulated API, creating a tree looks a bit different but the call to `schematize` is the same:

```typescript
// -- encapsulated API --
const tree = SharedTree.create(runtime, "foo");
const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));
```

## New

After migrating this code away from `schematize` and onto `viewWith`, it would look like this on the create codepath:

```typescript
const treeConfig = new TreeViewConfiguration({ schema: Point });

// The following line reflects the first-party API (e.g. @fluidframework/aqueduct). If using the third-party API, obtaining
// a SharedTree is unaffected by this changeset.
const tree = SharedTree.create(runtime, "foo");
const view = tree.viewWith(treeConfig);
view.initialize(new Point({ x: 0, y: 0 }));
```

and this on the load codepath:

```typescript
// 'tree' would typically be obtained by retrieving it from a well-known location, e.g. within a `DataObject`'s
// root directory or in `IFluidContainer.initialObjects`
const view = tree.viewWith(treeConfig);
```

Besides only making the initial tree required to specify in places that actually perform document initialization, this is beneficial for mutation semantics: `tree.viewWith` never modifies the state of the underlying tree.
This means applications are free to attempt to view a document using multiple schemas (e.g. legacy versions of their document format) without worrying about altering the document state.

# Separate `schemaChanged` event on `TreeView`

The previous `rootChanged` event was called whenever the root was invalidated, which happens on changes to the document schema
as well as changes to the root field (i.e. usage of `TreeView.root`'s setter on a local client, or acking such a change made by
a remote client).

There was no distinct `schemaChanged` event, meaning that any time the root changed,
clients would have needed to check the `error` state on `TreeView` to see if the document's underlying schema had been changed.

Now, the latter case of the document's underlying schema changing has been split off into a `schemaChanged` event, which will
fire before `rootChanged`.
This should allow applications to run slightly less compatibility logic to routine changes to the root field.
