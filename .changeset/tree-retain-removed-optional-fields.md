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

#### Staged permissions are preserved at each stored location

Schema upgrades now compose existing stored permissions with the additions requested by the view.
An already-allowed type remains allowed even if it is staged in the view and the configured policy does not enable new staged permissions.
An already-optional field remains optional when the view supports missing content, including through staged optionality.
For example, stored `number | string` composed with a view that declares `number | staged(string)` remains `number | string`; with no other changes, the upgrade is a no-op.

Preservation applies separately at each location.
If a shared staged token is enabled at `primaryPriority` but not at `fallbackPriority`, a restrictive upgrade preserves that partial state.
The policy must explicitly enable the token to introduce string values at the second location.
New documents still use only the view and configured policy; they do not inherit permissions from other documents.

The alpha `StagedSchemaUpgradePolicy.includeAlreadyEnabledUpgrades` flag has been removed.
Remove that property from policy literals:

```typescript
// Before:
const policy = {
	...StagedSchemaUpgradePolicy.restrictive,
	includeAlreadyEnabledUpgrades: true,
};

// After: preservation is automatic at each stored location.
const policy = StagedSchemaUpgradePolicy.restrictive;
```

Applications that relied on the old flag to enable every location of a partially enabled token must now explicitly enable it with `StagedSchemaUpgradePolicy.enabledStagedUpgrades(token)` or the policy callbacks.
Setting the old flag to `false` no longer opts out of preservation.

`canUpgrade` checks whether the composed candidate preserves existing content and supports the requesting view.
It does not check whether the stored schema can be replaced with a copy of the view schema.
Retaining a type does not make it readable by a view that neither declares nor stages it; incompatible views and definitions remain rejected.
