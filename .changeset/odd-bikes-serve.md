---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/datastore-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/ordered-collection": minor
"@fluidframework/register-collection": minor
"__section": feature
---

Add a builder-based summary API with centralized successful-summary state

The new `ISummaryBuilder` and `ISummarizable` APIs let the container runtime, data stores, and DDSes write summary content into a shared tree, using a single latest-successful-summary sequence number to decide when unchanged subtrees can be reused. The existing summary APIs are unchanged, and a summary is produced entirely by one flow or the other. The flow that uses these APIs is off by default behind the `Fluid.ContainerRuntime.EnableSummarizeV2` feature gate.
