---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add complete schema diagnostics to the alpha API

Alpha tree views expose `allDiscrepancies` through [compatibility](https://fluidframework.com/docs/api/tree/treeview-interface#compatibility-propertysignature).
This list includes schema content, staging, and persisted metadata differences, even when every compatibility flag is true.

When [canView](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#canview-propertysignature), [canUpgrade](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#canupgrade-propertysignature), or [isEquivalent](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#isequivalent-propertysignature) is false, the status also exposes the corresponding `viewDiscrepancies`, `upgradeDiscrepancies`, or `equivalenceDiscrepancies` subset.
Narrow the flag before accessing its subset.
These represent only the subset of the schema discrepancies that contribute to the associated compatibility status.

The alpha [checkCompatibility](https://fluidframework.com/docs/api/tree/#checkcompatibility-function) and [comparePersistedSchema](https://fluidframework.com/docs/api/tree/#comparepersistedschema-function) helpers return the same diagnostic information without [canInitialize](https://fluidframework.com/docs/api/tree/schemacompatibilitystatus-interface#caninitialize-propertysignature).
All diagnostic lists support JSON serialization and deterministic ordering within a library version.
Non-persisted custom metadata and descriptions are excluded.

Existing compatibility flags and beta discrepancy details are unchanged.

### Inspect an alpha view's diagnostics

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

### Compare schemas without creating a document

Use [checkCompatibility](https://fluidframework.com/docs/api/tree/#checkcompatibility-function) to compare the schema that created a document with a proposed view schema.
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
