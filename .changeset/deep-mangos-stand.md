---
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"__section": feature
---

Shorter IDs for DataStores and DDSes

Fixed a long pending bug, which now enables us to use shorter ids for Datastores and DDSes when `enableRuntimeIdCompressor:"on"` is set in `IContainerRuntimeOptions`. This change should help in reduction in summary and snapshot sizes as well as improve runtime performance because of smaller memory footprint.
