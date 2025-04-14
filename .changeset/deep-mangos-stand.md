---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"__section": feature
---

Shorter IDs for DataStores and DDSes

Fluid Framework will now use shorter IDs for Datastores and DDSes when `enableRuntimeIdCompressor:"on"` is set in `IContainerRuntimeOptions`. This change should help reduce summary and snapshot sizes as well as improve runtime performance because of a smaller memory footprint.
