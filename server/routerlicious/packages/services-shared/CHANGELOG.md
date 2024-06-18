# @fluidframework/server-services-shared

## 5.0.0

### Minor Changes

-   server-services-shared: Fixed the ordering in Nexus shutdown ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Before, the Redis Pub/Sub would be disposed before the socket connections were closed. Now we first close socket
    connections then do Redis disposal.

    You can find more details in [pull request #20429](https://github.com/microsoft/FluidFramework/pull/20429).

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
