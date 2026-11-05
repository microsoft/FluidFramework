---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Optional fields can be removed from application schema without blocking later upgrades

Object schema with `allowUnknownOptionalFields` enabled can now omit previously stored optional fields and still upgrade existing documents.
SharedTree retains those fields and the node definitions they require, preserving their content for clients that still declare them.
This supports rolling back schema changes or retiring features while continuing to evolve the schema.

For example, an application can remove `notes` and later add an unrelated optional field:

```typescript
const factory = new SchemaFactory("tasks");

// Earlier application version.
class Before extends factory.object("Task", {
	title: factory.string,
	notes: factory.optional(factory.string),
}) {}

// Later application version: remove `notes` and add `isApproved`.
class After extends factory.object(
	"Task",
	{
		title: factory.string,
		isApproved: factory.optional(factory.boolean),
	},
) {}

// Open a document initialized by the earlier version.
const view = tree.viewWith(new TreeViewConfiguration({ schema: After }));
if (view.compatibility.canUpgrade) {
	view.upgradeSchema();
}
```

The upgrade adds `isApproved` without removing the stored `notes` field or its content.
New documents initialized with `After` do not include `notes` in their stored schema.
Removing required fields and incompatible changes to declared fields or node types remain unsupported.

Schema compatibility snapshot checks now accept either direct viewing or a safe upgrade in both directions.
For versions within `minVersionForCollaboration`, `snapshotSchemaCompatibility` requires `canView || canUpgrade` for each version viewing documents created with the other schema.
The current version must also be able to view or upgrade documents from every historical snapshot outside that collaboration window.
Clients that can already view a document remain supported even when they cannot upgrade it; clients that can do neither are rejected.

A successful snapshot check does not apply the upgrade or change the compatibility flags.
When `canView` is false and `canUpgrade` is true, the application must still call `upgradeSchema()` before accessing the document through that view.
