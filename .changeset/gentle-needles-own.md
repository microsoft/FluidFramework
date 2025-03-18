---
"@fluid-experimental/tree": minor
---
---
"section": other
---

The OrderedEditSet interface now has a getLocalEdits method

Previously, `EditLog` was imported to cast to this type for access to the `getLocalEdits` method. In addition, the
`./test/EditLog` export has been removed.
