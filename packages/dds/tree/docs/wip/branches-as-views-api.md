# SharedTree API Proposal: Updated Branching APIs and New `Tree.context()` API

This proposes a refined API for accomplishing branching, as well as a general-purpose API for acquiring a `TreeView` from an arbitrary `TreeNode`.

## Branching via the View

The main thrust of this proposal is to place the branching APIs (`branch()`, `merge()`, `rebase()`, etc.) on the `TreeView` object itself, rather than being on a separate `TreeBranch` object (as is the case in the current alpha branching API).
Because branching does not require a schema, this introduces a new base interface that is extended by `TreeView`: `TreeContext`.
A `TreeContext` is a user-facing interface for operations/data that are common to all nodes in a `TreeCheckout` but which do not require a schema.
Operations that _do_ require a schema (like getting the tree root) belong on the `TreeView`.
For the alpha version of this API, we can introduce `TreeContext` as an alpha type, and a new `TreeViewAlpha` type that is the (existing and public) `TreeView` type with the additional functionality.

### TreeViewAlpha

The alpha `TreeViewAlpha` interface will extend the public `TreeView` interface and will expose the additional functionality.
To acquire a `TreeViewAlpha`, users will need to pass a `TreeView` to a top-level function, e.g. `getTreeViewAlpha(view: TreeView)` or similar.

```ts
/** @alpha */
interface TreeContext {
	/** 
	 * This typeguard lets users automatically downcast a `TreeContext` to a `TreeView`. 
	 * This is useful when using the `getContext()` API - see below.
	 */
	hasSchema<TSchema>(schema: TSchema): this is TreeViewAlpha<TSchema>;

	branch(): TreeContext;
	merge(branch: TreeContext, disposeMerged?: boolean): void;
	rebase(branch: TreeContext): void;
	rebaseOnto(branch: TreeContext): void;
}

/** @alpha */
interface TreeViewAlpha<TSchema> extends TreeView<TSchema>, TreeContext {
	// This override guarantees a schematized return type - it has the same schema as the originating view.
	// Most of the time, users will be doing `const view2 = view.branch()` - i.e. going directly from a view to another view with the same schema.
	branch(): TreeViewAlpha<TSchema>;
}

/** @public */
interface TreeView<TSchema> /* extends TreeViewAlpha */ {
	//... all the tree view stuff that requires a schema (root, schema, initialize, etc.)
}
```

### Changing Schema across Branches

#### `viewAs()`

The above methods allow branching a view to create another (branched) view with the same schema.
However, there is no way for the user to take an arbitrary branch and view it with a different schema.
Instead, a user wanting to view with a different schema must go back up to the top-level `ITree` object, call `viewWith()`, and then create branches from there.
We do not currently support this since we throw an error if a user attempts to create multiple views of the same checkout.
If we wanted to allow users to have branches with different schema at this time, or without having to go back up to the `ITree`, we could let them transition a view to another view with a different schema.
For example, we could put a `viewAs()` method on the `TreeContext`.

```ts
interface TreeContext {
	// ...

	// Calling this must dispose the current context because at the time of writing we don't support multiple views of the same checkout.
	viewAs<TSchema>(schema: TSchema): TreeViewAlpha<TSchema>;
	// If we anticipate allowing multiple views per checkout in the future, and we wouldn't want this to auto-dispose in that future, we could do this for now:
	viewAs<TSchema>(schema: TSchema, disposeView: true = true): TreeViewAlpha<TSchema>;
}
```

If a user has a `TreeContext` (that they don't know the schema of) or a `TreeView` (that they do know the schema of), they can replace it with a view with a different schema.

#### `branch(schema)`

Another possibility would be to add an optional schema parameter to the `branch()` method.

```ts
interface TreeContext {
	// ...

	branch(): TreeContext;
	branch<TSchema>(schema: TSchema): TreeViewAlpha<TSchema>;

	// ...
}
```

This lets users create a branch with an alternative schema in one step, which might be more straightforward.
It would also be more efficient, since we would not need to create the branched view with the old schema before disposing it in favor of a new view with the new schema upon calling `viewAs()`.

#### Comparison

* `viewAs()` is less straightforward than `branch(schema)`, but it allows users to switch to a new schema without doing any branching.
* `branch(schema)` very naturally supports a user who wants to create a branch that has a different schema, but without `viewAs()` they _have_ to make a new branch in order to switch to a different schema.

We could implement one or the other, or both, or neither, depending on what we expect our customers to need.
If omitted, either/both can be added in the future without being a breaking change.

## `Tree.context()`

We ought to be able to get a `TreeView` and/or `TreeContext` from a node.
We can do this via a top-level function, probably on the `Tree.*` interface.
This is convenient for any APIs that take contexts or views but the user only has a handle to a node.

```ts
interface Tree {
	context(node: TreeNode): TreeContext | undefined;
}
```

It lets us avoid having to write APIs like the existing "transaction API" which take a node for convenience, as well as a view.
Instead, it could simply take a view, because the user can easily get a view from a node.

### Getting a `TreeView` from a `TreeContext`

The `TreeContext` that the user gets back from `context()` _is_ a `TreeView`, but we can't know at compile time what the schema of the `TreeView` is because we don't store that generic type information in the `TreeNode` type.
So the user must do the downcast themselves;

```ts
const context = Tree.context(myNode);
if (context?.hasSchema(MySchema)) {
	// Inside this conditional, `context` is now strongly typed as a `TreeView<MySchema>`, because `hasSchema()` is a typeguard.
	const root = context.root; // So we can access `root`, for example, which is on the view but not the (un-schematized) context.
}
```

> For now, users will actually have to do `TreeAlpha.context` rather than just `Tree.context` since it will be an alpha API.
> This will also give users a way to get `TreeViewAlpha` objects rather than just `TreeView`s.
> If a user wants to directly convert a `TreeView` to a `TreeViewAlpha`, they can do `TreeAlpha.context(view.root)`.
> None of this will be necessary when the API becomes public, of course.

### Alternative Transaction API

As a bonus, this would even allow us to move the transaction API to be a method on the context, since the user can now get a context from a node.

```ts
interface TreeContext {
	// ...

	runTransaction(transaction: () => void);
}
```

Currently, a user does:

```ts
Tree.runTransaction(myNode, () => {
	myNode.foo = 3;
	myNode.bar = 3;
})
```

Instead they could do:

```ts
const context = Tree.context(myNode);
assert(context !== undefined, "Expected myNode to be in the tree");
Tree.context(myNode).runTransaction(() => {
	myNode.foo = 3;
	myNode.bar = 3;
});
```

or, if they are confident that their node is already in the tree (i.e. hydrated):

```ts
Tree.context(myNode)?.runTransaction(() => {
	myNode.foo = 3;
	myNode.bar = 3;
});
```

This is not much more work for the user, and it would greatly reduce the number of overloads that we need to document and support to implement the transaction API.
The same can be said about any possible future API that might otherwise allow the user to pass either a view _or_ a node, for convenience.
Instead, we can always accept merely a view.

## Branches with No Schema

This proposal does not describe a way for a user to get an un-schematized branch.
That is, the user always has a handle to a `TreeView`, even when it is typed as merely a `TreeContext`.
So while by design every `TreeView` is a `TreeContext`, in _practice_ every `TreeContext` is also a `TreeView`.
However, since the interfaces are structured as they are, we could give the user a handle to an un-schematized branch in the future without any type changes.
We simply hand them something that satisfies the `TreeContext` interface but not the `TreeView` interface.
You could imagine that e.g. the user is able to create a branch off of the `ITree`, before it is schematized.
That branch, and any further branches off of it, would all be `TreeContext`s without corresponding schema/`TreeView`s.
That would necessitate adding either the `viewAs()` method or `branch(schema)` overload as describe above, so that those `TreeContext`s could be turned into `TreeView`s when the user needs to read/edit them.

## Example Scenarios

```ts
function getViewFromNode<TSchema>(node: TreeNode, schema: TSchema): TreeView<TSchema> {
	const context = Tree.context(node);
	assert(context?.hasSchema(schema));
	return context;
}

function branchWithSameSchema<T>(view: TreeView<T>): TreeView<T> {
	return view.branch();
}

function branchWithDifferentSchema1<TSchema>(view: TreeView<ImplicitTreeNodeSchema>, schema: TSchema): TreeView<TSchema> {
	const branchView = view.branch();
	return branchView.viewAs(schema);
}

function branchWithDifferentSchema2<TSchema>(view: TreeView<ImplicitTreeNodeSchema>, schema: TSchema): TreeView<TSchema> {
	return view.branch(schema);
}
```
