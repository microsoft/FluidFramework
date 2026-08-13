---
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"__section": feature
---

Add a builder-based summary API with centralized successful-summary state

The new summary builder API lets container runtimes, data stores, and DDSes write summary content into a shared tree while using a single latest-successful-summary sequence number to decide when unchanged subtrees can be reused. Existing summary APIs remain available, and channels that have not migrated continue to work through a compatibility fallback.
