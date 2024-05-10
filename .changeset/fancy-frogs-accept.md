---
"@fluidframework/cell": minor
---

cell: SharedCell now uses ISharedObjectKind and does not export class

Most users of SharedCell just need to replace usages of the `SharedCell` type with `ISharedCell`.
