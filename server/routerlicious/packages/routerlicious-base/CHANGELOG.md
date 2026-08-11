# @fluidframework/server-routerlicious-base

## 6.0.0

### Major Changes

-   Cleanup underlying orderer connection when last socket disconnects from a session ([#21528](https://github.com/microsoft/FluidFramework/pull/21528)) [3c6bfc3d42](https://github.com/microsoft/FluidFramework/commit/3c6bfc3d429285b568bdfae417accfcaa5e0e190)

    When a websocket disconnect occurs in the Nexus lambda, the underlying Orderer (Kafka or Local) connection will be closed and removed if it was the last connection open for a given tenantId/documentId. Various classes and types were updated to enable connection cleanup: added IOrdererManager.removeOrderer, changed KafkaOrdererFactory.delete to return a Promise due to internal orderer connection close, added removeOrderer to OrdererManager and LocalOrdererManager.

-   Added support for health endpoints for HTTP services. ([#22635](https://github.com/microsoft/FluidFramework/pull/22635)) [9d41303ccf](https://github.com/microsoft/FluidFramework/commit/9d41303ccfcda161426eabf2aa88befbe7b09034)

    This adds health endpoints - `/startup`, `/ping` and `/ready` - for Alfred, Riddler and Nexus. Alfred still uses its old ping endpoint - `/api/v1/ping`. It also adds a request listener to the Nexus HTTP server to allow for these endpoints.

-   Added the startup probe as a resource for Alfred, Nexus and Riddler ([#22819](https://github.com/microsoft/FluidFramework/pull/22819)) [c5d7bde895](https://github.com/microsoft/FluidFramework/commit/c5d7bde895e5cc35e985b5d3d58d9059a26a95b2)

    The startup probe was intended to be a singleton. However, this caused issues between Historian and Routerlicious. To ensure no weird compatability issues arise, this singleton implementation has been removed.

-   Surface internal error codes correctly ([#23681](https://github.com/microsoft/FluidFramework/pull/23681)) [14bcca9b7f](https://github.com/microsoft/FluidFramework/commit/14bcca9b7fd3c542d6f28f406c1e95a4eea7892f)

    Previously, handleResponse() would override internal error codes with a default status of 500. This change ensures that we only fall back to 500 when no valid internal error code is present. This specifically impacts the getDeltas API, where certain cases incorrectly returned 500 instead of 404.

-   Added healthCheck for mongo database ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Exposed a healthCheck property from MongoManager class, and added a healthCheck method to the MongoDb class.

-   Adds a new resource type - IFluidAccessTokenGenerator ([#22884](https://github.com/microsoft/FluidFramework/pull/22884)) [b621e4a25d](https://github.com/microsoft/FluidFramework/commit/b621e4a25ddcddebcd5fa952dfa60eb759550f7b)

    This resource type can be used by a new endpoint, `/api/v1/tenants/:tenantId/accesstoken`, to generate an access token for the service. This resource is customizable and can be injected into the endpoint.

-   Fix Signal Notifications API replacing `TypedEventEmitter` with `@socket.io/redis-emitter` ([#23846](https://github.com/microsoft/FluidFramework/pull/23846)) [6f0e62d0f3](https://github.com/microsoft/FluidFramework/commit/6f0e62d0f34d3ecd96c2dd6dd941f6d459efc1d5)

    Some breaking changes were introduced by replacing `TypedEventEmitter` with `@socket.io/redis-emitter` (`RedisEmitter`). All of the changes modfify the signature of existing functions, used to create Alfred instances. The type of `collaborationSessionEventEmitter` was changed from `TypedEventEmitter` to `RedisEmitter`.

    Here is a list of the changes:

    -   Modified type `collaborationSessionEventEmitter` from `TypedEventEmitter` to `RedisEmitter` in Alfred. This parameter was modified in the following functions:
        -   `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/app.ts`
        -   `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/api.ts`
        -   `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/api/index.ts`
        -   `create` in `server/routerlicious/packages/routerlicious-base/src/alfred/routes/index.ts`
        -   `AlfredRunner` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runner.ts`
        -   `AlfredResources` constructor in `server/routerlicious/packages/routerlicious-base/src/alfred/runnerFactory.ts`

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   Added support for Redis graceful shutdown ([#23212](https://github.com/microsoft/FluidFramework/pull/23212)) [807f880dfe](https://github.com/microsoft/FluidFramework/commit/807f880dfebe0e0716f9de178bda6b6529e473ba)

    Now there's a way to ensure that Redis connections are gracefully shut down when disposing service factory resources. There is a new required param, `redisClientConnectionManagers`, in the Nexus, Alfred, and Riddler RunnerFactories. This is scoped to r11s-base.

-   Deprecated bindCorrelationId middleware removed from Alfred and Riddler Express apps ([#22109](https://github.com/microsoft/FluidFramework/pull/22109)) [18b76b29ff](https://github.com/microsoft/FluidFramework/commit/18b76b29ff92f2362fb3aaba09c82f13e8b2d7b3)

    If enableGlobalTelemetryContext is set to false, retrieving correlationId via deprecated getCorrelationId will no longer work.

-   Riddler now has a new API to sign access tokens ([#23410](https://github.com/microsoft/FluidFramework/pull/23410)) [0630c3946c](https://github.com/microsoft/FluidFramework/commit/0630c3946cba67ab77adaf9159f809ef113e8f7e)

    Adds a new Riddler API - `/accesstoken`. This is used to sign access tokens based on the tenant's configuration. This change also enables disabling shared key access for a tenant using the `/keyaccess` API. Lastly, it removes support to fetch private keys using the `/keys` API. For Alfred `DocumentManager`, this change removes the `getKey` call and replaces it with the `signToken` API call.

-   Now Riddler supports using private keys to sign server access tokens ([#23379](https://github.com/microsoft/FluidFramework/pull/23379)) [87c92ca185](https://github.com/microsoft/FluidFramework/commit/87c92ca185dcb128553ae183bd6bfc2a6c487c77)

    Riddler's tenant manager now exposes two new properties - `enablePrivateKeyAccess` and `enableSharedKeyAccess`. These respectively indicate whether a tenant can be accessed using hidden private keys and whether a tenant can be accessed using shared secrets. APIs now support toggling the `enablePrivateKeyAccess` prop. They also support fetching these new keys and refreshing these new keys. All calls to manipulate private keys should be made from within the server.

-   `.off()` instance method added to IProducer and IOrdererConnection implementations ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces. All exported implementations of IProducer and IOrdererConnection have had a `.off()` method added, and all functions that take IProducer or IOrdererConnection params have had their types updated as well.

## 5.0.0

### Minor Changes

-   server-routerlicious-base: Add support for custom tenant key generators ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Added support to add a custom tenant key generator instead of using just the default 128-bit sha256 key.

    You can find more details in [pull request #20844](https://github.com/microsoft/FluidFramework/pull/20844).

-   server-routerlicious-base: Remove Riddler HTTP request for performance ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    The `getOrderer` workflow no longer calls `getTenant` when `globalDb` is enabled. This saves two HTTP calls to Riddler
    and will improve performance.

    You can find more details in [pull request #20773](https://github.com/microsoft/FluidFramework/pull/20773).

## 4.0.0

### Major Changes

-   Alfred no longer handles websocket traffic ([#19227](https://github.com/microsoft/FluidFramework/issues/19227)) [8766d1d800](https://github.com/microsoft/FluidFramework/commits/8766d1d800b8e04c4000b36d794a729736f462ba)

    Removed the websocket component of Alfred and stood it as a new microservice, Nexus. When running locally it will run on port 3002. Clients that have discovery enabled and use deltaStreamUrl need no change as they will automatically connect to Nexus. If support for older clients is necessary, an Nginx redirect for Alfred socket requests to be forwarded to Nexus can be used.

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
