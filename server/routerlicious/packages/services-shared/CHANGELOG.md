# @fluidframework/server-services-shared

## 6.0.0

### Major Changes

-   Created a utility function for Redis connection handling ([#23212](https://github.com/microsoft/FluidFramework/pull/23212)) [807f880dfe](https://github.com/microsoft/FluidFramework/commit/807f880dfebe0e0716f9de178bda6b6529e473ba)

    Exported a new function - `closeRedisClientConnections` - that helps shut down Redis connections using the `quit()` command.

-   Surface internal error codes correctly ([#23681](https://github.com/microsoft/FluidFramework/pull/23681)) [14bcca9b7f](https://github.com/microsoft/FluidFramework/commit/14bcca9b7fd3c542d6f28f406c1e95a4eea7892f)

    Previously, handleResponse() would override internal error codes with a default status of 500. This change ensures that we only fall back to 500 when no valid internal error code is present. This specifically impacts the getDeltas API, where certain cases incorrectly returned 500 instead of 404.

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   Startup probe not a singleton anymore ([#22819](https://github.com/microsoft/FluidFramework/pull/22819)) [c5d7bde895](https://github.com/microsoft/FluidFramework/commit/c5d7bde895e5cc35e985b5d3d58d9059a26a95b2)

    Singleton implementation of this module caused bugs to surface in Historian. Hence, reverted the singleton implementation to a regular one.

-   Added support for the creation of health-check endpoints - `/startup`, `/ready` and `/ping`. ([#22635](https://github.com/microsoft/FluidFramework/pull/22635)) [9d41303ccf](https://github.com/microsoft/FluidFramework/commit/9d41303ccfcda161426eabf2aa88befbe7b09034)

    The endpoints will be consumed by all HTTP services. These can be used by Kubernetes health probes to monitor container health. It also maintains backward compatability for services like Alfred which already have an existing `/ping` endpoint. It also adds a singleton service to monitor startup status.

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
