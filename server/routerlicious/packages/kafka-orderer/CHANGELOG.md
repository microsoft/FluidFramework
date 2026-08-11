# @fluidframework/server-kafka-orderer

## 6.0.0

### Major Changes

-   Cleanup underlying orderer connection when last socket disconnects from a session ([#21528](https://github.com/microsoft/FluidFramework/pull/21528)) [3c6bfc3d42](https://github.com/microsoft/FluidFramework/commit/3c6bfc3d429285b568bdfae417accfcaa5e0e190)

    When a websocket disconnect occurs in the Nexus lambda, the underlying Orderer (Kafka or Local) connection will be closed and removed if it was the last connection open for a given tenantId/documentId. Various classes and types were updated to enable connection cleanup: added IOrdererManager.removeOrderer, changed KafkaOrdererFactory.delete to return a Promise due to internal orderer connection close, added removeOrderer to OrdererManager and LocalOrdererManager.

-   `.off()` instance method added to IProducer and IOrdererConnection implementations ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    In order to allow consumers of IProducer and IOrdererConnection implementations to cleanup event listeners added using the already-exposed `.once()` and `.on()` methods, a `.off()` method was added as a required property to both interfaces. All exported implementations of IProducer and IOrdererConnection have had a `.off()` method added, and all functions that take IProducer or IOrdererConnection params have had their types updated as well.

## 5.0.0

Dependency updates only.

## 4.0.0

### Major Changes

-   Alfred no longer handles websocket traffic ([#19227](https://github.com/microsoft/FluidFramework/issues/19227)) [8766d1d800](https://github.com/microsoft/FluidFramework/commits/8766d1d800b8e04c4000b36d794a729736f462ba)

    Removed the websocket component of Alfred and stood it as a new microservice, Nexus. When running locally it will run on port 3002. Clients that have discovery enabled and use deltaStreamUrl need no change as they will automatically connect to Nexus. If support for older clients is necessary, an Nginx redirect for Alfred socket requests to be forwarded to Nexus can be used.

## 3.0.0

### Major Changes

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)
