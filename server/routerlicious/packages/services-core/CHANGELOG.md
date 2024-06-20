# @fluidframework/server-services-core

## 5.0.0

### Minor Changes

-   server-services-core: New configuration setting for ephemeral container soft delete ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    `IDeliServerConfiguration` defines a new optional property, `ephemeralContainerSoftDeleteTimeInMs`, that controls whenn
    ephemeral containers are soft-deleted.

    You can find more details in [pull request #20731](https://github.com/microsoft/FluidFramework/pull/20731).

-   server-services-core: New optional dispose method ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Adds optional `dispose` method to `IWebSocket` for disposing event listeners on disconnect in Nexus lambda.

    You can find more details in [pull request #21211](https://github.com/microsoft/FluidFramework/pull/21211).

-   server-services-core: Reduce session grace period for ephemeral containers to 2 minutes (was 10 minutes) ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    For ephermeral container, the session grace period is reduced from 10 minutes to 2 minutes when cluster is draining.
    This ensures the ephemeral container gets cleaned after disconnection sooner. Clients will not find old EH containers
    and will need to create new containers. This logic only takes effect when forcing draining.

    You can find more details in [pull request #21010](https://github.com/microsoft/FluidFramework/pull/21010).

-   server-services-core: Fix: Limit max length of validParentSummaries in checkpoints ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Limits maximum number of tracked valid parent (service) summaries to 10 by default. Configurable via
    `IScribeServerConfiguration` in `scribe` property of `IServiceConfiguration`.

    You can find more details in [pull request #20850](https://github.com/microsoft/FluidFramework/pull/20850).

-   server-lambdas, server-services-core: SessionStartMetric removed from Scribe and Deli microservices ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    This change removes the SessionStartMetric from Scribe and Deli. The metric is a source of bugs and has been superseded
    by the `restoreFromCheckpoint` and `RunService` metrics.

    You can find more details about the reasons for this change in
    [pull request #21125](https://github.com/microsoft/FluidFramework/pull/21125).

## 4.0.0

Dependency updates only.

## 3.0.0

### Major Changes

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   server-services-client: New `messageBrokerId` property added to `ISession` [817f661734](https://github.com/microsoft/FluidFramework/commits/817f66173489ffa920200c96f122416c9a044d66)

    The `ISession` interface was updated with new field `messageBrokerId` that would be assigned when message broker is set to Event Hubs.

-   Updated @fluidframework/common-utils ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-utils dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-utils/CHANGELOG.md#310)
