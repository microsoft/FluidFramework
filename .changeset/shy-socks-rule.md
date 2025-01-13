---
"@fluid-experimental/property-changeset": minor
---
---
"section": fix
---

Fix 'Error: PR-008: Trying to remove a non-existing entry' error in IndexedCollection class

The `IndexedCollection` class would throw the following error when applying a changeset:

```
Error: PR-008: Trying to remove a non-existing entry:
```

The underlying problem has been fixed and this error should no longer occur.

_Thanks to [@neerajcharokar](https://github.com/neerajcharokar) for submitting this fix!_
