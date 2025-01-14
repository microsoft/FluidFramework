---
"@fluid-experimental/property-changeset": patch
---
---
"section": fix
---

Fix 'Error: PR-008: Trying to remove a non-existing entry' error in IndexedCollection class

The IndexedCollection class would throw the following error when applying a changeset:

```
Error: PR-008: Trying to remove a non-existing entry:
```

The underlying problem has been fixed and this error should no longer occur.
