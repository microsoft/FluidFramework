---
"@fluid-experimental/tree": minor
---
---
"section": other
---

Added getLocalEdits method to OrderedEditSet interface and removed unnecessary test export
Previously, `EditLog` was imported to cast to this type for access to the `getLocalEdits` method. This change removes the need for this cast, so we can get rid of the `./test/EditLog` export.
