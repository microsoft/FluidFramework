---
"@fluidframework/aqueduct": minor
"__section": fix
---
Allow default-data-store runtime factories to receive compatibility settings

`ContainerRuntimeFactoryWithDefaultDataStoreProps` now exposes the optional
`oldestSupportedClient` and deprecated `minVersionForCollab` properties already supported by its
base factory. This lets callers select compatibility explicitly before the setting becomes
required.
