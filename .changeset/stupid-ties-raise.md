---
"@fluidframework/driver-definitions": minor
"@fluidframework/driver-web-cache": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": deprecation
---
Move IPersistedCache types to driver-definitions

In an effort to decouple the driver web cache from the odsp driver a number of types have been moved from `@fluidframework/odsp-driver-definitions` to `@fluidframework/driver-definitions`. The moved types have been deprecated in `@fluidframework/odsp-driver-definitions`, and any usages should be moved to  `@fluidframework/driver-definitions`.

The moved types are:
 - `IEntry`
 - `IFileEntry`
 - `ICacheEntry`
 - `IPersistedCache`
