# @fluidframework/server-lambdas

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
