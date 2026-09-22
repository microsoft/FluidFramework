---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add complete schema diagnostics to the alpha API

Alpha tree views expose `allDiscrepancies` through [compatibility](https://fluidframework.com/docs/api/tree/treeview-interface#compatibility-propertysignature).
This list reports differences in schema constraints, persisted metadata, and view annotations.
It covers the root field and node definitions, including stored definitions that are not reachable from the root.

Each entry describes one aspect at one location, with values for the applicable sides:

- `existingStored`: the document's existing stored schema.
- `view`: the schema being evaluated for access, with its constraints in stored-schema form and all staged changes included, together with its staging annotations and unknown optional field policy.
- `proposedStored`: the stored schema generated from the view schema and the configured staged upgrade policy, including whether to retain upgrades already enabled in the document.

The proposed stored schema is the schema used to check whether an upgrade is permitted.
The proposed stored schema does not imply that an upgrade has occurred or will occur.
The proposed stored schema can be identical to the existing stored schema.
It can differ from both the existing stored schema and the view's constraints.
Stored schemas do not contain staging annotations or the view's unknown optional field policy.
Those entries provide view-only context, so `allDiscrepancies` is not solely a diff between the existing and proposed stored schemas.
The report does not compare application classes, methods, or object identities, and it does not inspect document content.

When [canView](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#canview-propertysignature), [canUpgrade](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#canupgrade-propertysignature), or [isEquivalent](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#isequivalent-propertysignature) is false, the status also exposes the corresponding `viewDiscrepancies`, `upgradeDiscrepancies`, or `equivalenceDiscrepancies` subset.
Narrow the flag before accessing its subset.
Each subset is nonempty and selects unchanged entries from `allDiscrepancies`:

- `viewDiscrepancies` explains why the view schema cannot provide read-write access under the document's existing stored schema. This check does not compare against the proposed stored schema.
- `upgradeDiscrepancies` explains why the existing stored schema cannot be upgraded to the proposed stored schema generated from the view's configuration.
- `equivalenceDiscrepancies` includes viewing blockers, upgrade blockers, and differences that prevent the reverse stored-schema comparison from the proposed stored schema to the existing stored schema.

A difference can belong to more than one subset.
The complete list can be nonempty even when `canView`, `canUpgrade`, and `isEquivalent` are all true.
Persisted metadata differences and view-only annotations do not by themselves prevent viewing, upgrading, or equivalence.
Use the blocker subsets to identify which differences prevent each check from succeeding.

The alpha [checkCompatibility](https://fluidframework.com/docs/api/tree/#checkcompatibility-function) and [comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) helpers return the same diagnostic information without [canInitialize](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#caninitialize-propertysignature).
That flag reports whether a document has neither stored schema nor tree content, which schema comparison alone cannot determine.
Neither helper inspects document content.
All diagnostic lists support JSON serialization and deterministic ordering within a library version.
Non-persisted custom metadata and descriptions are excluded.

Existing compatibility flags and beta discrepancy details are unchanged.
The beta `discrepancies` property continues to report viewing blockers rather than all schema differences.

#### Inspect an alpha view's diagnostics

Pass an alpha view's [compatibility](https://fluidframework.com/docs/api/tree/treeview-interface#compatibility-propertysignature) value to this function.
The complete list is always available, while each blocker list requires narrowing its corresponding flag to `false`.

```typescript
import type { SchemaCompatibilityStatusAlpha } from "@fluidframework/tree/alpha";

function logCompatibility(status: SchemaCompatibilityStatusAlpha): void {
	console.log(JSON.stringify(status.allDiscrepancies, undefined, 2));

	if (!status.canView) {
		console.log("Viewing blockers:", status.viewDiscrepancies);
	}
	if (!status.canUpgrade) {
		console.log("Upgrade blockers:", status.upgradeDiscrepancies);
	}
	if (!status.isEquivalent) {
		console.log("Equivalence blockers:", status.equivalenceDiscrepancies);
	}
}
```

#### Compare schemas without creating a document

Use [checkCompatibility](https://fluidframework.com/docs/api/tree/#checkcompatibility-function) to check a view schema against a stored schema generated from an earlier configuration.
Only the `schema` property of each configuration is used.
The helper generates the existing and proposed stored schemas with the default restrictive staged upgrade policy, even if you supply alpha configurations with another policy.
This example compares a stored number schema with a string view schema.
It uses [SchemaFactory](https://fluidframework.com/docs/api/tree/schemafactory-class) to select the schema types and [TreeViewConfiguration](https://fluidframework.com/docs/api/tree/treeviewconfiguration-class) to configure each schema.
The schemas are incompatible, so the result includes viewing blockers.

```typescript
import {
	checkCompatibility,
	SchemaFactory,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";

const factory = new SchemaFactory("example");
const previous = new TreeViewConfiguration({ schema: factory.number });
const proposed = new TreeViewConfiguration({ schema: factory.string });
const status = checkCompatibility(previous, proposed);

console.log(JSON.stringify(status.allDiscrepancies, undefined, 2));
if (!status.canView) {
	console.log(status.viewDiscrepancies);
}
```

Use [comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) when the original schema is available in persisted form.
Its result supports the same diagnostic properties and flag narrowing.
It decodes the original stored schema and generates the proposed stored schema from the view schema with the default restrictive staged upgrade policy.
It does not accept a staged upgrade policy.

For the number-to-string comparison above, `allDiscrepancies` contains:

```json
[
	{
		"mismatch": "allowedType",
		"location": "root",
		"allowedType": "com.fluidframework.leaf.number",
		"view": false,
		"existingStored": true,
		"proposedStored": false
	},
	{
		"mismatch": "allowedType",
		"location": "root",
		"allowedType": "com.fluidframework.leaf.string",
		"view": true,
		"existingStored": false,
		"proposedStored": true
	},
	{
		"mismatch": "missingNode",
		"location": {
			"nodeType": "com.fluidframework.leaf.number"
		},
		"missingFrom": [
			"view",
			"proposedStored"
		],
		"existingStored": {
			"kind": "leaf"
		}
	},
	{
		"mismatch": "missingNode",
		"location": {
			"nodeType": "com.fluidframework.leaf.string"
		},
		"missingFrom": [
			"existingStored"
		],
		"view": {
			"kind": "leaf"
		},
		"proposedStored": {
			"kind": "leaf"
		}
	}
]
```

All three compatibility flags are false.
`viewDiscrepancies` contains the two `allowedType` entries.
`upgradeDiscrepancies` contains the number `allowedType` entry and the missing number definition.
`equivalenceDiscrepancies` contains all four entries.
The missing definitions are reported separately because stored-schema comparisons also cover detached nodes.

#### Compare a persisted metadata change

This example keeps the same node identifier and field schema but changes the persisted metadata.
Both configurations describe `example.Item`, so the comparison reports a metadata difference on that definition.

```typescript
import {
	checkCompatibility,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
} from "@fluidframework/tree/alpha";

const factory = new SchemaFactoryAlpha("example");
const previousSchema = factory.objectAlpha(
	"Item",
	{ value: factory.number },
	{ persistedMetadata: { version: 1 } },
);
const proposedSchema = factory.objectAlpha(
	"Item",
	{ value: factory.number },
	{ persistedMetadata: { version: 2 } },
);
const previous = new TreeViewConfiguration({ schema: previousSchema });
const proposed = new TreeViewConfiguration({ schema: proposedSchema });
const status = checkCompatibility(previous, proposed);

console.log(JSON.stringify(status.allDiscrepancies, undefined, 2));
```

The output is:

```json
[
	{
		"mismatch": "persistedMetadata",
		"location": {
			"nodeType": "example.Item"
		},
		"view": {
			"version": 2
		},
		"existingStored": {
			"version": 1
		},
		"proposedStored": {
			"version": 2
		}
	}
]
```

All three compatibility flags are true because persisted metadata does not affect compatibility.
The `viewDiscrepancies`, `upgradeDiscrepancies`, and `equivalenceDiscrepancies` properties are absent.
Equivalence does not require identical persisted metadata, and `upgradeSchema()` makes no change when `isEquivalent` is true.
In both examples, `proposedStored` matches `view` because neither schema uses staged upgrades.
The entry order shown here is illustrative; callers must not depend on a particular sorting rule.
