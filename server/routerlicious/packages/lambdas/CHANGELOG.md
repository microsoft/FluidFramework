# @fluidframework/server-lambdas

## 6.0.0

### Major Changes

-   Cleanup underlying orderer connection when last socket disconnects from a session ([#21528](https://github.com/microsoft/FluidFramework/pull/21528)) [3c6bfc3d42](https://github.com/microsoft/FluidFramework/commit/3c6bfc3d429285b568bdfae417accfcaa5e0e190)

    When a websocket disconnect occurs in the Nexus lambda, the underlying Orderer (Kafka or Local) connection will be closed and removed if it was the last connection open for a given tenantId/documentId. Various classes and types were updated to enable connection cleanup: added IOrdererManager.removeOrderer, changed KafkaOrdererFactory.delete to return a Promise due to internal orderer connection close, added removeOrderer to OrdererManager and LocalOrdererManager.

-   Orderer Connection "error" listener disposed on disconnect ([#21948](https://github.com/microsoft/FluidFramework/pull/21948)) [e924f4ec3a](https://github.com/microsoft/FluidFramework/commit/e924f4ec3a9f7d16b17da7551d9fc92a5a54372d)

    The Nexus lambda's per-socket-orderer-connection error listener is now removed when the socket connection ends.

-   Added pause and resume methods for lambdas ([#22730](https://github.com/microsoft/FluidFramework/pull/22730)) [256bf0899c](https://github.com/microsoft/FluidFramework/commit/256bf0899c041914da3236b3a1c9d8ecc85d3b34)

    Added pause and resume methods for context, documentContext, partition, partitionManager, kakfaRunner, rdKafkaConsumer, and lambda. They are used to pause/resume the incoming messages during various circuitBreaker states.

-   Optional session tracking added to Nexus Lambda ([#22381](https://github.com/microsoft/FluidFramework/pull/22381)) [9a932a638b](https://github.com/microsoft/FluidFramework/commit/9a932a638b701ad36fed8fd1b273e63bcb335878)

    An optional `ICollaborationSessionTracker` param was added to `configureWebSocketServices` in the Nexus Lambda. When provided, this tracker is used to output telemetry when a collaboration session for a document/container ends. The telemetry includes helpful information such as session duration, max concurrent clients, whether there were any writer clients involved, etc.

-   Added a new event - `dispose` - which is triggered when `.dispose()` is called ([#23212](https://github.com/microsoft/FluidFramework/pull/23212)) [807f880dfe](https://github.com/microsoft/FluidFramework/commit/807f880dfebe0e0716f9de178bda6b6529e473ba)

    This event is triggered when disposing factory resources. It can be used to trigger other graceful shutdown methods.

-   User input validation added in Nexus Lambda connect_document handler ([#22381](https://github.com/microsoft/FluidFramework/pull/22381)) [9a932a638b](https://github.com/microsoft/FluidFramework/commit/9a932a638b701ad36fed8fd1b273e63bcb335878)

    Nexus Lambda was making a lot of unsafe assumptions about the user's input for the connect_document message handler. To simplify type checking within Nexus and make accessing input properties safer, Nexus lambda now specifically emits a 400 error when the connect_document message input is malformed.

-   Types altered to account for undefined and null values ([#23054](https://github.com/microsoft/FluidFramework/pull/23054)) [09b7299e1c](https://github.com/microsoft/FluidFramework/commit/09b7299e1cbf1d800d4bea2bef6b7d0bc657ddb6)

    Many types updated to reflect implementations that can return null or undefined, but did not call that out in type definitions. Internal functionality only changed to handle existing null/undefined cases that are now known at compiletime.

## 5.0.0

### Minor Changes

-   server-lambdas: Nexus client connections can now disconnect in batches ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Added the option to make Nexus client connections disconnect in batches. The new options are within `socketIo`
    element of the Nexus config:

    -   `gracefulShutdownEnabled` (true or false)
    -   `gracefulShutdownDrainTimeMs` (overall time for disconnection)
    -   `gracefulShutdownDrainIntervalMs` (how long each batch has to disconnect)

    Additionally, the `DrainTimeMs` setting should be set to a value greater than the setting
    `shared:runnerServerCloseTimeoutMs` which governs how long Alfred and Nexus have to shutdown.

    You can find more details in [pull request #19938](https://github.com/microsoft/FluidFramework/pull/19938).

-   server-lambdas: Performance: Keep pending checkpoint message for future summaries ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    During a session there may be multiple client/service summary calls, and independently, multiple checkpoints. Checkpoint
    will clear messages storage in `pendingCheckpointMessages`, which is also used for writing summaries. Because of this
    cleanup, when we write new summaries, it often needs to request the ops from Alfred again, which is not quite
    efficient.

    Now the pending messages are cached for improved performance.

    You can find more details in [pull request #20029](https://github.com/microsoft/FluidFramework/pull/20029).

-   server-lambdas: Fix: send correct connection scopes for client ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    When a client joins in "write" mode with only "read" scopes in their token, the connection message from server will reflect a "read" client mode.

    You can find more details in [pull request #20312](https://github.com/microsoft/FluidFramework/pull/20312).

-   server-lambdas: Fix: cover edge cases for scrubbed checkpoint users ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Overhauled how the Scribe lambda handles invalid, missing, or outdated checkpoint data via fallbacks.

    Before:

    ```
    if (no global checkpoint)
      use Default checkpoint
    elsif (global checkpoint was cleared or  global checkpoint quorum was scrubbed)
      use Summary checkpoint
    else
      use latest DB checkpoint (local or global)
    ```

    After:

    ```
    if (no global and no local checkpoint and no summary checkpoint)
      use Default checkpoint
    elsif (
    	global checkpoint was cleared and summary checkpoint ahead of local db checkpoint
    	or latest DB checkpoint quorum was scrubbed
    	or summary checkpoint ahead of latest DB checkpoint
    )
      use Summary checkpoint
    else
      use latest DB checkpoint (local or  global)
    ```

    Also: Updated `CheckpointService` with additional fallback logic for loading a checkpoint from local or global DB
    depending on whether the quorum information in the checkpoint is valid (i.e. does not contain scrubbed users).

    You can find more details in [pull request #20259](https://github.com/microsoft/FluidFramework/pull/20259).

-   server-lambdas, server-services-core: SessionStartMetric removed from Scribe and Deli microservices ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    This change removes the SessionStartMetric from Scribe and Deli. The metric is a source of bugs and has been superseded
    by the `restoreFromCheckpoint` and `RunService` metrics.

    You can find more details about the reasons for this change in
    [pull request #21125](https://github.com/microsoft/FluidFramework/pull/21125).

## 4.0.0

### Major Changes

-   Alfred no longer handles websocket traffic ([#19227](https://github.com/microsoft/FluidFramework/issues/19227)) [8766d1d800](https://github.com/microsoft/FluidFramework/commits/8766d1d800b8e04c4000b36d794a729736f462ba)

    Removed the websocket component of Alfred and stood it as a new microservice, Nexus. When running locally it will run on port 3002. Clients that have discovery enabled and use deltaStreamUrl need no change as they will automatically connect to Nexus. If support for older clients is necessary, an Nginx redirect for Alfred socket requests to be forwarded to Nexus can be used.

## 3.0.0

### Major Changes

-   BREAKING CHANGE: Foreman lambda removed [c6e203af0c](https://github.com/microsoft/FluidFramework/commits/c6e203af0c4e1ed431d15b7e7892f7f8e3342b8b)

    The Foreman lambda in @fluidframework/server-lambdas has been removed. It has not been used for several releases. There
    is no replacement.

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   Updated @fluidframework/common-utils ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-utils dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-utils/CHANGELOG.md#310)

-   Updated @fluidframework/common-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-definitions dependency has been upgraded to v1.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-definitions/CHANGELOG.md#110)
