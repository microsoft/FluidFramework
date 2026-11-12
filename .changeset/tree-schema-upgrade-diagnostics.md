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
`SchemaViewIncompatibility` describes viewing failures and adds a human-readable `reason` to the existing `SchemaDiscrepancy` details.
`SchemaUpgradeIncompatibility` describes upgrade failures.
Each incompatibility in the new results includes a `reason` explaining the failed constraint and its location.
Use it for logging and debugging; use `mismatch` and the structured fields for programmatic handling.
The reason describes schema constraints, not application intent or a prescribed fix.

Upgrade details compare the existing stored schema with the proposed stored schema after applying the staged-upgrade policy.
They identify removed allowed types, prohibited field-kind transitions, incompatible node or value kinds, and missing node definitions.
`nodeSchemaCannotBeSatisfied` identifies a proposed node definition with requirements that cannot be satisfied under the upgrade rules,
such as a required field that allows no child types.
Its reason identifies the required field or map constraint.
If the proposed schema is an allowed stored-schema upgrade but would still block viewing,
`viewIncompatibleAfterUpgrade` includes the viewing incompatibilities with that proposed schema.
For example, preserving existing allowed types can retain types that the view does not support.
When viewing is possible, upgrade incompatibilities are computed only when first read and cached for that compatibility result.
Retained results continue to describe the schema snapshot used when they were created, even after the document schema changes.

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
