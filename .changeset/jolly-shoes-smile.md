---
"@fluidframework/aqueduct": minor
"__section": fix
---
Allow default-data-store runtime factories to receive compatibility settings

[`ContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastoreprops-interface)
now exposes the optional
[`oldestSupportedClient`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#oldestsupportedclient-propertysignature)
and deprecated
[`minVersionForCollab`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#minversionforcollab-propertysignature)
properties already supported by
[`BaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface).
This lets callers select compatibility explicitly before the setting becomes required.
