---
"@fluidframework/tree": major
---

Implement compatibility-based schema evolution API

This change adjusts some top-level APIs for using SharedTree in a context that may necessitate changing a document's schema.
First of all, `SharedTree`'s restrictions around view schema and stored schema compatibility have been slightly relaxed:
A particular view schema can now be used to open documents whose stored schema supports a superset of that view schema.
Beware that applications which choose to do this may experience runtime incompatibilities in application logic: for instance,
the stored schema for a document may contain allowed types in fields which the view schema isn't expecting,
which could result in application errors.
The motivation for this change is to eventually allow more flexible application policies around what types of schema incompatibilities
are OK to allow different clients to collaborate using.

Application authors are encouraged to develop a compatibility policy which they are comfortable with using the guidance in the
"Schema Evolvability" section of `@fluidframework/tree`'s readme.

To make the details of schema compatibilities that SharedTree supports more clear,
`TreeView.error` has been functionally replaced with the `compatibility` property.
Users desiring the previous strict behavior can use `view.compatibility.isExactMatch` at appropriate places in application logic.

In addition to this functional change to the types of collaboration that `SharedTree` permits, several APIs have been tweaked.

# `ITree.schematize` deprecation

`ITree.schematize` has been deprecated in favor of `ITree.viewWith`.
Unlike `schematize`, `viewWith` does not implicitly initialize the document. As such, it doesn't take an `initialTree` property.
Instead, applications should initialize their trees in document creation codepaths using the added `TreeView.initialize` API.

As an example, something like the following code may have been used before for both the document create and document load codepaths:

```typescript
const tree = SharedTree.create(runtime, "foo");
const view = tree.schematize(new TreeConfiguration(Point, () => new Point({ x: 0, y: 0 })));
```

Now, that code would look like this on the create codepath:

```typescript
const tree = SharedTree.create(runtime, "foo");
const view = await tree.viewWith({ schema: Point });
view.initialize(new Point({ x: 0, y: 0 }));
```

and this on the load codepath:

```typescript
const tree = SharedTree.create(runtime, "foo");
const view = await tree.viewWith({ schema: Point });
```

Besides only making the initial tree required to specify in places that actually perform document initialization, this is beneficial for mutation semantics: `tree.viewWith` never modifies the state of the underlying tree.

# Separate `schemaChanged` event on `TreeView`

The previous `rootChanged` event was called whenever the root was invalidated, which happens on changes to the document schema
as well as changes to the root field (i.e. usage of `TreeView.root`'s setter on a local client, or acking such a change made by
a remote client).

There was no distinct `schemaChanged` event, meaning that any time the root changed,
clients would have needed to check the `error` state on `TreeView` to see if the document's underlying schema had been changed.

Now, the latter case of the document's underlying schema changing has been split off into a `schemaChanged` event, which will
fire before `rootChanged`.
This should allow applications to run slightly less compatibility logic to routine changes to the root field.
