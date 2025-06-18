# @fluidframework/server-services-core

## 6.0.0

### Major Changes

-   Added a new interface - IFluidAccessTokenGenerator ([#22884](https://github.com/microsoft/FluidFramework/pull/22884)) [b621e4a25d](https://github.com/microsoft/FluidFramework/commit/b621e4a25ddcddebcd5fa952dfa60eb759550f7b)

    The `IFluidAccessTokenGenerator` interface can be implemented to create an access token for the service.

-   Adds support to call the `/accesstoken` Riddler API ([#23410](https://github.com/microsoft/FluidFramework/pull/23410)) [0630c3946c](https://github.com/microsoft/FluidFramework/commit/0630c3946cba67ab77adaf9159f809ef113e8f7e)

    Introduces a new interface method in `ITenantManager` - `signToken`. This allows all classes implementing this interface to ask Riddler to sign access tokens.

-   Cleanup underlying orderer connection when last socket disconnects from a session ([#21528](https://github.com/microsoft/FluidFramework/pull/21528)) [3c6bfc3d42](https://github.com/microsoft/FluidFramework/commit/3c6bfc3d429285b568bdfae417accfcaa5e0e190)

    When a websocket disconnect occurs in the Nexus lambda, the underlying Orderer (Kafka or Local) connection will be closed and removed if it was the last connection open for a given tenantId/documentId. Various classes and types were updated to enable connection cleanup: added IOrdererManager.removeOrderer, changed KafkaOrdererFactory.delete to return a Promise due to internal orderer connection close, added removeOrderer to OrdererManager and LocalOrdererManager.

-   Added pause and resume methods for lambdas ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Added pause and resume methods for context, documentContext, partition, partitionManager, kakfaRunner, rdKafkaConsumer, and lambda. They are used to pause/resume the incoming messages during various circuitBreaker states.

-   Added Collaboration Session Tracking Interfaces ([#22381](https://github.com/microsoft/FluidFramework/pull/22381)) [9a932a638b](https://github.com/microsoft/FluidFramework/commit/9a932a638b701ad36fed8fd1b273e63bcb335878)

    Added `ICollaborationSessionClient`, `ICollaborationSession`, `ICollaborationSessionManager`, and `ICollaborationSessionTracker` interfaces to define dependency injection types for new collaboration session tracking functionality in the Nexus lambda.

-   Added healthCheck for mongo database ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Exposed a healthCheck property from MongoManager class, and added a healthCheck method to the MongoDb class.

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

-   `.off()` instance method added to IProducer and IOrdererConnection types ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces.

-   Added interfaces to support readiness checks ([#22635](https://github.com/microsoft/FluidFramework/pull/22635)) [9d41303ccf](https://github.com/microsoft/FluidFramework/commit/9d41303ccfcda161426eabf2aa88befbe7b09034)

    This PR adds an interface which can implemented to have readiness checks for a service. This can be used by kubernetes to check the readiness of an instance.

-   Adds new props to the tenant interface to support private key based access ([#23379](https://github.com/microsoft/FluidFramework/pull/23379)) [87c92ca185](https://github.com/microsoft/FluidFramework/commit/87c92ca185dcb128553ae183bd6bfc2a6c487c77)

    Now tenants have two new properties - `enablePrivateKeyAccess` and `enableSharedKeyAccess`. These are used by Riddler to determine whether a tenant allows just shared key access, private key access or both.

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
