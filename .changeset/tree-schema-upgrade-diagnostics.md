---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
New compatibility APIs explain viewing and upgrade incompatibilities

The beta compatibility API adds `asBeta(view).compatibility.view` and `.upgrade`.
Each `CompatibilityResult` groups the decision for an operation with the incompatibilities that prevent it.
Successful results have `isCompatible: true`.
Unsuccessful results have `isCompatible: false` and a nonempty `incompatibilities` list.
The existing `canView` and `canUpgrade` properties remain available for checking viewing and upgrade compatibility, respectively.
`discrepancies` and `SchemaDiscrepancy` continue to describe viewing incompatibilities.

Check `compatibility.view.isCompatible` before accessing the tree root and `compatibility.upgrade.isCompatible` before requesting a schema upgrade.
These results are independent: viewing can be permitted even when upgrading is blocked, and an allowed upgrade does not mean an upgrade is needed.
When an operation is blocked, read its `incompatibilities` to find the schema constraints that prevent it.
`SchemaViewIncompatibility` describes viewing failures and adds a human-readable `reason` to the existing `SchemaDiscrepancy` details.
`SchemaUpgradeIncompatibility` describes upgrade failures.
Each incompatibility in the new results includes a `reason` explaining the failed constraint and its location.
Use it for logging and debugging; use `mismatch` and the structured fields for programmatic handling.
The reason describes schema constraints, not application intent or a prescribed fix.

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
