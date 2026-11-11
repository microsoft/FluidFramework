---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Explain viewing and upgrade incompatibilities with grouped compatibility results

The beta compatibility API adds `asBeta(view).compatibility.view` and `.upgrade`.
Each `CompatibilityResult` groups the decision for an operation with the incompatibilities that prevent it.
Successful results have `isCompatible: true`.
Unsuccessful results have `isCompatible: false` and a nonempty `incompatibilities` list.
The existing `canView`, `canUpgrade`, `discrepancies`, and `SchemaDiscrepancy` APIs remain supported and are not deprecated by this change.

Check `compatibility.view.isCompatible` before accessing the tree root and `compatibility.upgrade.isCompatible` before requesting a schema upgrade.
These results are independent: viewing can be permitted even when upgrading is blocked, and an allowed upgrade does not mean an upgrade is needed.
When an operation is blocked, read its `incompatibilities` to find the schema constraints that prevent it.
`SchemaIncompatibility` describes viewing failures and is equivalent to the existing `SchemaDiscrepancy` type.
`SchemaUpgradeIncompatibility` describes upgrade failures.

Upgrade details compare the existing stored schema with the proposed stored schema after applying the staged-upgrade policy.
They identify removed allowed types, prohibited field-kind transitions, incompatible node or value kinds, and missing or uninhabitable node definitions.
When viewing is possible, upgrade incompatibilities are computed only when first read and cached for that compatibility result.
Retained results continue to describe the schema snapshot used when they were created, even after the document schema changes.

```typescript
import { asBeta } from "@fluidframework/tree/beta";

const { compatibility } = asBeta(view);
if (!compatibility.view.isCompatible) {
    console.error(compatibility.view.incompatibilities);
    if (compatibility.upgrade.isCompatible) {
        view.upgradeSchema();
    } else {
        console.error(compatibility.upgrade.incompatibilities);
    }
}
```
