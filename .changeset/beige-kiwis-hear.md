---
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"__section": legacy
---
New ILayerCompatDetails property on LocalDocumentServiceFactory and OdspDocumentServiceFactoryCore

A new optional property, `ILayerCompatDetails`, has been added to `LocalDocumentServiceFactory` and `OdspDocumentServiceFactoryCore`.
This property is used by `Container` in the Loader layer to validate that the Loader and Driver layers are compatible.

Important: this property is intended for use by Fluid Framework code only. No code outside the Fluid Framework should use or depend on this property in any way.
