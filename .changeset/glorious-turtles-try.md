---
"@fluidframework/test-end-to-end-tests": minor
"@fluidframework/container-runtime": minor
"@fluid-internal/test-service-load": minor
---

Ability to enable grouped batching

The `IContainerRuntimeOptions.enableGroupedBatching` option has been added to the container runtime layer and is off by default. This option will group all batch messages
under a new "grouped" message to be sent to the service. Upon receiving this new "grouped" message, the batch messages will be extracted and given
the sequence number of the parent "grouped" message.

Upon enabling this option, if any issues arise, use the `Fluid.ContainerRuntime.DisableGroupedBatching` feature flag to disable at runtime. This option should **ONLY** be enabled after observing that 99.9% of your application sessions contains these changes (version "2.0.0-internal.4.1.0" or later). This option is experimental and should not be enabled yet in production. Containers created with this option may not open in future versions of the framework.

This option will change a couple of expectations around message structure and runtime layer expectations. Only enable this option after testing
and verifying that the following expectation changes won't have any effects:

-   batch messages observed at the runtime layer will not match messages seen at the loader layer
-   messages within the same batch will have the same sequence number
-   client sequence numbers on batch messages can only be used to order messages with the same sequenceNumber
-   requires all ops to be processed by runtime layer (version "2.0.0-internal.1.2.0" or later
    https://github.com/microsoft/FluidFramework/pull/11832)
