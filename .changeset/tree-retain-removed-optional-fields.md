---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Optional fields can be removed from application schema without blocking later upgrades

Object schema with [`allowUnknownOptionalFields`](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) enabled can now omit previously stored optional fields and still upgrade existing documents.
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

In the above example, the stored schema upgrade adds `isApproved` while preserving the existing `notes` field.

> [!IMPORTANT]
> A field's stored identifier (its stored key) is permanent in existing documents.
> Removing the field from a view does not free that identifier for reuse with an incompatible definition.
>
> For example, suppose a later version of `Task` declares `notes: factory.optional(factory.array(factory.string))` using the same stored key as the original optional string field.
> That view cannot load or safely upgrade documents whose stored schema still permits the original string-valued `notes` field.
> This conflict exists even if the document contains no data under the old `notes` definition, because the stored schema still permits strings that another client could write later.
>
> Use a different stored key for a different, incompatible field.
>
> To detect such conflicts before releasing a schema change, keep historical schema snapshots and use [`snapshotSchemaCompatibility`](https://fluidframework.com/docs/api/fluid-framework/index#snapshotschemacompatibility-function) tests.

#### Schema Compatibility Snapshot Testing

Schema compatibility snapshot checks now accept either direct viewing or a safe upgrade in both directions, rather than only supporting upgrade in a forwards direction.
For versions within `minVersionForCollaboration`, [`snapshotSchemaCompatibility`](https://fluidframework.com/docs/api/fluid-framework/index#snapshotschemacompatibility-function) requires `canView || canUpgrade` for each version viewing documents created with the other schema.
The current version must also be able to view or upgrade documents from every historical snapshot outside that collaboration window.
Clients that can already view a document remain supported even when they cannot upgrade it; clients that can do neither are rejected.

> [!IMPORTANT]
> Snapshot checks evaluate historical schemas using the currently installed Fluid Framework library versions, not the versions deployed with older clients.
> Before relying on older clients to upgrade while retaining unknown optional fields, deploy a version of the application that uses Fluid Framework library version `3.14.0` or higher.
