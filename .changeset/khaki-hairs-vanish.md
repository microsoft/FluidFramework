---
"fluid-framework": patch
"@fluidframework/map": patch
---

Map API documentation updates

Remaining top-level APIs within `@fluidframework/map` have had docs updated to reflect their sealed/readonly nature, i.e. they are not to be implemented externally to Fluid Framework and not changed, as has already been the case. Impacted APIs:
- [IDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/idirectory-interface) sealed
- [IDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryevents-interface) sealed
- [IDirectoryValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/idirectoryvaluechanged-interface) sealed and path property is readonly
- [ISharedDirectory](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectory-interface) sealed
- [ISharedDirectoryEvents](https://fluidframework.com/docs/api/v2/fluid-framework/ishareddirectoryevents-interface) sealed
- [IValueChanged](https://fluidframework.com/docs/api/v2/fluid-framework/ivaluechanged-interface) sealed
