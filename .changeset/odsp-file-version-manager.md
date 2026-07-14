---
"@fluidframework/odsp-driver": minor
"__section": other
"__includeInReleaseNotes": false
---

Add an internal ODSP file-version manager

Adds `OdspVersionManager` and `IOdspFileVersionFetcher` (with `createOdspFileVersionFetcher`) to `@fluidframework/odsp-driver`. Given a target sequence number, the manager selects the closest ODSP file version at or before it — the base for loading or replaying a document at a point in time. These are internal to the package (not exported from its public entry points) and not yet wired into a call site, so there is no consumer-facing change.
