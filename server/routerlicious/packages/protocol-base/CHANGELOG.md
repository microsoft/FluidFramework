# @fluidframework/protocol-base

## 5.0.0

### Minor Changes

-   protocol-base: Fix: ensure immutability of quorum snapshot ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    Creates a deeper clone of the quorum members when snapshotting to make sure the snapshot is immutable.

    You can find more details in [pull request #20329](https://github.com/microsoft/FluidFramework/pull/20329).

-   protocol-base: Fix: configure user data scrubbing in checkpoints and summaries ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    _Note: This change is primarily internal to routerlicious._

    -   When scribe boots from a checkpoint, it fails over to the latest summary checkpoint if the quorum is corrupted (i.e.
        user data is scrubbed).
    -   When scribe writes a checkpoint to DB or a summary, it respects new `IScribeServerConfiguration` options
        (scrubUserDataInSummaries, scrubUserDataInLocalCheckpoints, and scrubUserDataInGlobalCheckpoints) when determining
        whether to scrub user data in the quorum.
    -   Added optional param, `scrubUserData`, to `ProtocolOpHandler.getProtocolState()`. When `true`, user data in the quorum
        is replaced with `{ id: "" }`. Defaults to `false`. Previously was always scrubbed.
    -   Added the following configuration options for `IScribeServerConfiguration`:

        -   scrubUserDataInSummaries
        -   scrubUserDataInLocalCheckpoints
        -   scrubUserDataInGlobalCheckpoints

        All default to `false`.

    You can find more details in [pull request #20150](https://github.com/microsoft/FluidFramework/pull/20150).

## 4.0.0

Dependency updates only.

## 3.0.0

### Major Changes

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   Updated @fluidframework/common-utils ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-utils dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-utils/CHANGELOG.md#310)
