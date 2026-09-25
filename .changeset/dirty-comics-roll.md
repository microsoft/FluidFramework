---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Explain schema compatibility failures through the alpha API

Alpha tree views expose targeted diagnostic lists through [compatibility](https://fluidframework.com/docs/api/tree/treeview-interface#compatibility-propertysignature).
When `canView`, `canUpgrade`, or `isEquivalent` is false, the corresponding `viewDiscrepancies`, `upgradeDiscrepancies`, or `equivalenceDiscrepancies` list explains the failure.
Each list is nonempty when present and absent when its check succeeds.
Narrow the corresponding flag to `false` before accessing a list.

Each entry describes one aspect at one location, with values for the applicable sides:

- `existingStored`: the document's existing stored schema.
- `view`: the schema being evaluated for access, with its constraints in stored-schema form and all staged changes included.
- `proposedStored`: the stored schema generated from the view schema and the configured staged upgrade policy, including whether to retain upgrades already enabled in the document.

The proposed stored schema is the schema used to check whether an upgrade is permitted.
The proposed stored schema does not imply that an upgrade has occurred or will occur.
The proposed stored schema can be identical to the existing stored schema.
It can differ from both the existing stored schema and the view's constraints.
Stored schemas do not contain staging annotations or the view's unknown optional field policy.
The optional `viewIsStagedType`, `viewIsStagedOptional`, and `viewAllowsUnknownOptionalFields` properties provide relevant view context on constraint failures.
They are present only when true and are not standalone discrepancies.
The report does not compare application classes, methods, or object identities, and it does not inspect document content.

Each list has a specific scope:

- `viewDiscrepancies` explains why the view schema cannot provide read-write access under the document's existing stored schema. This check does not compare against the proposed stored schema.
- `upgradeDiscrepancies` explains why the existing stored schema cannot be upgraded to the proposed stored schema generated from the view's configuration.
- `equivalenceDiscrepancies` includes viewing blockers, upgrade blockers, and differences that prevent the reverse stored-schema comparison from the proposed stored schema to the existing stored schema.

A difference can belong to more than one list.
These lists explain failed checks; they do not provide a complete schema diff or preview a permitted upgrade.
Persisted metadata changes do not affect compatibility and are not reported.
Stored-schema checks include definitions that are not reachable from the root.

The alpha [checkCompatibility](https://fluidframework.com/docs/api/tree/#checkcompatibility-function) and [comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) helpers return the same diagnostic information without [canInitialize](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#caninitialize-propertysignature).
That flag reports whether a document has neither stored schema nor tree content, which schema comparison alone cannot determine.
Neither helper inspects document content.
All diagnostic lists support JSON serialization and deterministic ordering within a library version.
Non-persisted custom metadata and descriptions are excluded.

Existing compatibility flags and beta discrepancy details are unchanged.
The beta `discrepancies` property continues to report viewing blockers rather than all schema differences.

#### Inspect an alpha view's diagnostics

Pass an alpha view's [compatibility](https://fluidframework.com/docs/api/tree/treeview-interface#compatibility-propertysignature) value to this function.
Each blocker list requires narrowing its corresponding flag to `false`.

```typescript
import type { SchemaCompatibilityStatusAlpha } from "@fluidframework/tree/alpha";

function logCompatibility(status: SchemaCompatibilityStatusAlpha): void {
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

if (!status.canView) {
	console.log(JSON.stringify(status.viewDiscrepancies, undefined, 2));
}
```

Use [comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) when the original schema is available in persisted form.
Its result supports the same diagnostic properties and flag narrowing.
It decodes the original stored schema and generates the proposed stored schema from the view schema with the default restrictive staged upgrade policy.
It does not accept a staged upgrade policy.

For the number-to-string comparison above, `viewDiscrepancies` contains:

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
	}
]
```

All three compatibility flags are false.
`viewDiscrepancies` contains the two `allowedType` entries.
`upgradeDiscrepancies` contains the number `allowedType` entry and the missing number definition.
`equivalenceDiscrepancies` contains both allowed-type entries and both missing definitions.
The missing definitions are reported separately because stored-schema comparisons also cover detached nodes.

#### Interpret staging and unknown-field context

If an existing stored field is optional but the staged upgrade policy keeps it required in the proposed stored schema, `upgradeDiscrepancies` reports a `fieldKind` failure.
The entry has `viewIsStagedOptional: true` when the view declares staged optionality.
Similarly, excluding a staged type that the existing stored schema permits produces an `allowedType` failure with `viewIsStagedType: true`.

A view can allow unknown optional fields and still be unable to upgrade the document.
Removing those fields from the proposed stored schema can produce field-kind and allowed-type failures with `viewAllowsUnknownOptionalFields: true`.
These entries explain why viewing succeeds but upgrading fails.

Changing only persisted metadata leaves all three checks successful, so no diagnostic lists are present.
The entry order shown here is illustrative; callers must not depend on a particular sorting rule.
