---
"fluid-framework": minor
"@fluidframework/map": minor
---
---
kind: fix
---

Some SharedDirectory/SharedMap-related APIs have been sealed

Note that this is a _documentation only change._ There is no runtime or type-level impact.

Some top-level APIs within `@fluidframework/map` and `fluid-framework` have been updated to reflect their
sealed/readonly nature. That is, they are not to be implemented externally to Fluid Framework and not changed. This was
already the case, but the documentation was not clear.

Updated APIs:

- [IDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/idirectory-interface) sealed
- [IDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryevents-interface) sealed
- [IDirectoryValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryvaluechanged-interface) sealed and path property is readonly
- [ISharedDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectory-interface) sealed
- [ISharedDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectoryevents-interface) sealed
- [IValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/ivaluechanged-interface) sealed
