# @fluidframework/server-services-core

## 4.0.1

### Patch Changes

-   Fix: configure user data scrubbing in checkpoints and summaries ([#20150](https://github.com/microsoft/FluidFramework/issues/20150)) [04a2cc9](https://github.com/microsoft/FluidFramework/commit/04a2cc9ee88d4dbfc14bf44320456aa01749990c)

    Added the following configuration options for `IScribeServerConfiguration`: scrubUserDataInSummaries, scrubUserDataInLocalCheckpoints, and scrubUserDataInGlobalCheckpoints. All default to `false`.

-   Fix: cover edge cases for scrubbed checkpoint users ([#20259](https://github.com/microsoft/FluidFramework/issue/20259)) [6718a9a](https://github.com/microsoft/FluidFramework/commit/6718a9a1707d6a5bcc573acbb2d154b8840c4b72)

    Updated `CheckpointService` with additional fallback logic for loading a checkpoint from local or global DB depending on whether the quorum information in the checkpoint is valid (i.e. does not contain scrubbed users).

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
