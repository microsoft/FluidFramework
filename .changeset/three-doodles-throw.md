---
"@fluid-experimental/data-objects": minor
---

Fix using Signaler in ContainerSchema.

`Signaler` now implements `SharedObjectKind<ISignaler>`, allowing its use in `ContainerSchema` which was broken when ContainerSchema was made more strict.
Additionally fewer encapsulated APIs are exposed on Signaler and the instance type must now be `ISignaler` (instead of `Signaler`), which has been extended to have an "error" event which was previously missing.
