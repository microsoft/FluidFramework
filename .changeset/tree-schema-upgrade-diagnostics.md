---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
New compatibility APIs explain viewing and upgrade incompatibilities

When your view schema is incompatible with a document's stored schema, you need to know whether you can view the document, upgrade its schema, or do neither.
The new beta APIs, `asBeta(view).compatibility.view` and `.upgrade`, explain these two operations separately.
Each returns a `CompatibilityResult`: `isCompatible: true` means the operation is permitted, while `isCompatible: false` includes a nonempty `incompatibilities` list explaining what prevents it.

Start by checking `compatibility.view.isCompatible` before accessing the tree root.
If viewing is blocked, its `incompatibilities` explain why, and you can check `compatibility.upgrade.isCompatible` to see whether a schema upgrade would allow you to proceed.
If upgrading is also blocked, its own `incompatibilities` explain the schema requirements that prevent that option.
Because these permissions are independent, a viewable document can still have a blocked upgrade, and a permitted upgrade is not necessarily needed.

To help you diagnose either failure, every `SchemaViewIncompatibility` and `SchemaUpgradeIncompatibility` includes a human-readable `reason` explaining the failed schema requirement and its location.
Use these reasons for logging and debugging, or use `mismatch` and the structured fields when your application needs to handle a failure programmatically.
The reasons describe schema requirements rather than application intent, so they do not prescribe a fix.

You can adopt the new results without replacing existing compatibility checks: `canView` and `canUpgrade` remain available for their respective operations.
The existing `discrepancies` and `SchemaDiscrepancy` also remain available for viewing failures; `SchemaViewIncompatibility` adds `reason` to those same details.
The new APIs use "incompatibility" to align with compatibility terminology, while existing API names are retained for compatibility.
This change does not deprecate the existing APIs.

Here's an example of how the new APIs can be used:

```typescript
import { asBeta } from "@fluidframework/tree/beta";

const { compatibility } = asBeta(view);
if (!compatibility.view.isCompatible) {
    for (const { reason } of compatibility.view.incompatibilities) {
        console.error(reason);
    }
    if (compatibility.upgrade.isCompatible) {
        view.upgradeSchema();
    } else {
        for (const { reason } of compatibility.upgrade.incompatibilities) {
            console.error(reason);
        }
    }
}
```
