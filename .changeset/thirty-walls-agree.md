---
"@fluidframework/core-interfaces": minor
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": deprecation
---

Deprecation Notice: Interfaces Migrated to `@fluidframework/core-interfaces`

The following interfaces and types are now deprecated in `@fluidframework/tree`. It is recommended to import these interfaces from `@fluidframework/core-interfaces`.

In `@fluidframework/core-interfaces`, these can be imported as:

- Listeners → Listeners_base
- IsListener → IsListener_base
- Listenable → Listenable_base
- Off → Off_base

These deprecated interfaces are planned for removal in the FF 3.0 release.
