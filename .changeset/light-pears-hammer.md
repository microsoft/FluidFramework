---
"@fluidframework/container-definitions": minor
---
---
"section": deprecation
---

The IContainerContext.supportedFeatures property is now deprecated

The `IContainerContext.supportedFeatures` optional property was used internally to communicate features supported by the
Loader layer to the Runtime layer. This has since been replaced with functionality that is not exposed externally.
