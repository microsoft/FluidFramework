# Schema Evolution

This document outlines the general constraints around maintaining compatibility in an application document ecosystem in the face of schema changes.

## Context

When an application creates and uses a schema to open a document using `SchemaFactory` and `TreeView.initialize`,
information about that schema is persisted as part of the document.
The schema that the application works with in code is hereforth referred to as "view schema" and the schema persisted with the document "stored schema."

Compatibility scenarios can be described in terms of discrepancies between the view schema and the stored schema.
For example, an application in the geometry domain might try to open a document using a view schema constructed with:

```typescript
const builder = new SchemaFactory("Geometry");

class Point extends builder.object({
	x: builder.number,
	y: builder.number,
}) {}

class Circle extends builder.object({
	center: Point,
	radius: builder.number,
}) {}

class Plane extends builder.object({
	shapes: builder.array([Circle, Point]),
}) {}
```

but discover that the document's stored schema doesn't allow `Point` children under the `shapes` field, i.e. its definition of `Plane` was this:

```typescript
class Plane extends builder.object({
	shapes: builder.array([Circle]),
}) {}
```

Applications may leverage `SharedTree`'s compatibility APIs to implement policies that allow clients running incompatible code to fail in predictable ways.

## General Approach

SharedTree allows application authors to make _backward-compatible changes to document schema_ using `TreeView.upgradeSchema`.
A change to document schema is backward-compatible if the set of documents allowed by the old schema is a subset of documents allowed by the new schema.
Put differently, valid documents must remain valid.

The following types of changes are backward-compatible under this definition:

1. Adding an optional field to an object node
2. Adding to the set of allowed types for a field
3. Relaxing a field kind to a more general field kind

Adding new schemas (rather than modifying existing ones) is allowed and is a typical reason to make a change to the allowed types for a field.
Examples for each type of change can be found below.
Each change should be interpreted independently from the others (rather than in aggregate):

```typescript
// Base schema:
const builder = new SchemaFactory("Geometry");

class Point extends builder.object({
	x: builder.number,
	y: builder.number,
}) { }

class Circle extends builder.object({
	center: Point,
	radius: builder.number
}) { }

class Plane extends builder.object({
	shapes: builder.array([Circle, Point])
}) { }

// ---------------------------------------------------------
// Change type 1: adding an optional field to an object node

// Suppose the declaration of `Circle` was updated to:
class Circle extends builder.object({
	center: Point,
	radius: builder.number,
	color: builder.optional(builder.string),
}) { }

// -------------------------------------------------------------
// Change type 2: adding to the set of allowed types for a field

// Suppose the application wants to add support for a "square" notion like this:
class Square extends builder.object({
	length: builder.number,
}} { }
// They then update their "Plane" definition to allow it as a valid child:
class Plane extends builder.object({
	shapes: builder.array([Circle, Point, Square])
}) { }

// ------------------------------------
// Change type 3: relaxing a field kind

// Imagine that the application has added code allowing circles to have a default radius of 1.
// In its schema, the required radius field can be made optional:
class Circle extends builder.object({
	center: Point,
	radius: builder.optional(builder.number),
}) { }
```

> Note: Currently, the only supported field kind relaxation is converting a required field to an optional one.

Despite these changes being backwards-compatible at a data level, it's important that applications carefully consider the application-level consequences of clients running older code collaborating with clients using the new schema!
To illustrate this point, suppose a client--call it `Old` is viewing a document using the base schema above, and the application logic renders the content into a picture.
If another client--call it `New`--joins, upgrades the schema, and begins leveraging it, there might still be compatibility problems!

For example, if `New`'s schema upgrade adds the possibility of squares into the set of shapes and `New` then inserts a square into the document, `Old`'s application may be unable to render this piece of content and crash.

Similarly, `New` making the `radius` field of `Circle` optional would likely also result in crashes for the `Old` application if it continued collaborating in the session.

On the other hand, if `New`'s schema upgrade added the optional color field and `New` inserted a circle with some particular color, `Old`'s application might do an acceptable job rendering the piece of content: the "color" property wouldn't be reflected in the rendering, but `New` and `Old`'s view of the document would generally align.

Each of the scenarios between `Old` and `New` comes with assumptions that may or may not be accurate for a given application.
For example, the application authors may have foreseen "shape type" as a point of future extensibility, and built into `Old`'s code some forward-compatible fallback behavior when it encounters an unknown shape.
In this scenario, `Old` would be able to continue collaboration, albeit with a degraded experience.
Whether or not a particular schema change breaks scenarios where two clients on different code versions collaborate is not something that `SharedTree` can determine.
In lieu of this, `SharedTree` exposes several APIs which give applications visibility into differences between the view schema and stored schema.
Application authors should use these APIs to develop a policy which makes sense for their ecosystem around the limits of cross-version compatibility they want to support.

## Compatibility APIs

The `TreeView` interface exposes `TreeView.compatibility` outlining compatibility properties between the view schema used to construct the `TreeView` and the document's stored schema.
Additionally, because the stored schema for a document can change over time (a remote client might call `TreeView.upgradeSchema`), `TreeView.events` raises a `schemaChanged` event whenever compatibility between view and stored schema may have changed.

Authors of applications should use these observability points to implement policy desirable for their ecosystem.
Before reading through the next section, the reader should familiarize themselves with the fields on `TreeView.compatibility` and their semantics.

### Sample policies

This section outlines some compatibility policies applications can implement, including code samples on how to do so.
Choices here are non-committal in the sense that an application won't incur indefinite backward-compatibility promises in their ecosystem for making some particular choice.

> **_WARNING_** Currently, `SharedTree` only supports the 'enforce equivalent schema' policy. There are near-term plans (with the same API) to allow opening a document which has additional optional fields in its stored schema that are not present in the view schema, and longer-term plans to allow opening documents using older view schemas when a document's stored schema has been upgraded with other types of backward-compatible changes.

The main consequences for particular policies are the constraints around how application logic modifications can be made over time.
Policies which are stricter about schemas aligning cross-client will require applications to wait longer for code saturation before leveraging new features.
On the other hand, they reduce the complexity of the compatibility matrix that application authors must consider.
Policies which are more lax are the opposite: developers can make more types of changes without worrying about saturation or rollout,
but may need to consider the impact of clients collaborating using different versions of their code.

Code samples below are sufficient to point out the important compatibility details, but to see a full & working example with invalidation, see [inventory-app](../../../../../examples/data-objects/inventory-app).

The samples here aren't meant to be exhaustive. It's up to the application authors to design a compatibility & evolution policy that works for them.
For example, some applications may even want to give the user some say in when a document gets upgraded, or leverage the schema metadata field to implement compatibility policies of their own.
Policies implemented here also upgrade a document's schema on open, which doesn't always work in ecosystems with readonly clients and can impact document metadata like 'last edit.'

#### Enforce Exact Schema Match

The simplest approach from a compatibility standpoint is to only open documents which have schema equivalent to the application's current view schema:

```typescript
function render(tree: ITree) {
	const view = tree.viewWith(configuration);
	const { compatibility } = view;
	if (!compatibility.isEquivalent) {
		if (compatibility.canUpgrade) {
			view.upgradeSchema();
		} else {
			renderError("This version of the application is unable to open the document.");
			return;
		}
	}

	view.events.on("schemaChanged", () => {
		if (!view.compatibility.isEquivalent) {
			renderError(
				"Document has been upgraded. This version of the application is unable to open the document.",
			);
			return;
		}

		// Schema changes invalidate the root of the tree. Real applications would want to react to that here.
	});

	// Application can open document!
	renderApplication(view.root);
}
```

One consequence of this approach in isolation is that clients on old code versions can be "locked out" of documents when newer clients upgrade them,
at least until the clients running old code are able to upgrade to the newer application version.
This might be acceptable for applications with very quick deployment cadences.

To mitigate this in ecosystems with larger version skew, application authors could roll out schema changes by first deploying an application version which understands both the newer and older schema, but avoids upgrading to the newer schema.

Once the application version that understands both schemas saturates sufficiently, the application can start upgrading documents to the newer schema.

#### Allow optional field additions

> **_WARNING:_** The policy outlined in this section is not currently implementable. There are plans to extend the `compatibility` API with information that allows implementing policies such as this, but the exact API is not finalized.

Adding an optional field to an object node is one of the safer types of schema changes from the perspective of clients running older code collaborating with clients running newer code.
This is because newer code must already have fallback behavior for absence of the optional field for backward-compatibility reasons, and older application code can generally just "ignore the extra field".
That isn't strictly true--old client code code using a spread operation or reflection APIs like `Object.keys` will only receive properties present in its view schema, even if extra optional properties are present.
Thus, certain types of edits made by that old client can end up losing data in the optional field (e.g. old client constructs a new object for insertion elsewhere in the tree by spread-copying fields from an existing one).
This caveat might be acceptable for application authors enough for them to allow collaboration between such clients.

This policy can be implemented as follows:

```typescript
// The only types of differences which are tolerated are where the stored schema has optional fields
// where the view schema has no field.
function isApplicationLogicCompatible(compatibility: SchemaCompatibilityStatus): boolean {
	for (const difference of compatibility.differences) {
		if (difference.mismatch === "nodeType") {
			return false;
		}

		for (const fieldDifference of difference.differences) {
			if (
				fieldDifference.mismatch !== "fieldKind" ||
				fieldDifference.view !== undefined ||
				fieldDifference.stored !== "optional"
			) {
				return false;
			}
		}
	}

	return true;
}

function render(tree: ITree) {
	const view = tree.viewWith(configuration);
	const { compatibility } = view;
	if (!compatibility.canView) {
		// View schema allows documents that stored schema does not.
		if (compatibility.canUpgrade) {
			view.upgradeSchema();
		} else {
			// Assuming well-formed rollout, this case should not happen: it means the current view schema
			// is neither a subset nor a superset of the stored schema.
			// It could happen in practice if application authors made a change breaking backward-compatibility of the view schema.
			renderError("This document cannot be opened.");
			return;
		}
	} else if (!isApplicationLogicCompatible(compatibility)) {
		// Surface to the user that this application version is unable to open this document / updating the application may help.
		renderError("This version of the application is unable to open the document.");
		return;
	}

	view.events.on("schemaChanged", () => {
		if (!view.compatibility.canView || !isApplicationLogicCompatible(view.compatibility)) {
			renderError(
				"Document has been upgraded. This version of the application is unable to open the document.",
			);
			return;
		}
		// Schema changes invalidate the root of the tree. Real applications would want to react to that here.
	});

	// Application can open document!
	renderApplication(view.root);
}
```

#### No policy

It's worth noting the experience that an application author gets if they don't bother with any compatibility considerations before attempting to make their first schema change.
In this case, their code likely looks something like this:

```typescript
const view = tree.viewWith(configuration);
renderApplication(view.root);
```

When this code attempts to open an older document, accessing `view.root` will throw an error, which might prompt the change:

```typescript
const view = tree.viewWith(configuration);
if (view.compatibility.canUpgrade) {
	view.upgradeSchema();
}
renderApplication(view.root);
```

This will allow the local client to open documents, but remote clients who receive the schema change won't react appropriately if they haven't subscribed to the `schemaChanged` event. This prompts:

```typescript
const view = tree.viewWith(configuration);
if (view.compatibility.canUpgrade) {
	view.upgradeSchema();
}

view.events.on("schemaChanged", () => {
	// Invalidate root
});

renderApplication(view.root);
```

which will work "as well as the application does," in the sense that `SharedTree` will successfully report data changes and allow collaboration within the limits of what is possible: optional fields can be added to object nodes over time and old clients will still be permitted to collaborate.
After other types of backward-compatible document upgrades, clients using older view schemas will fail to open the document with a clear error message (accessing `view.root` will throw).

## Further Reading

Managing collaborative application ecosystems is a challenging problem. This section includes some resources to Fluid documentation on the topic, which application authors might find helpful for further thinking in this space.

-   [This document](../../../SchemaVersioning.md) outlines high-level constraints and the general approach Fluid uses for managing compatibility.
-   [Persisted format management](../main/compatibility.md) for `SharedTree`
