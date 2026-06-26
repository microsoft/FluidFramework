---
"@fluidframework/local-driver": minor
"@fluidframework/odsp-driver": minor
"__section": feature
---
New ILayerCompatSupportRequirements property on LocalDocumentServiceFactory and OdspDocumentServiceFactoryCore

A new optional property, `ILayerCompatSupportRequirements`, has been added to `LocalDocumentServiceFactory` and `OdspDocumentServiceFactoryCore`.

The Driver layer uses this property to publish the requirements that the Loader layer must meet to be compatible with it. Because the Driver has no reference to the Loader, it cannot validate the Loader directly; instead the Loader reads these requirements and validates itself against them on the Driver's behalf. This enables the Loader / Driver compatibility check to run in both directions.
