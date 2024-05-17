# @fluidframework/protocol-base

## 4.0.1

### Patch Changes

-   Fix: ensure immutability of quorum snapshot ([#20329](https://github.com/microsoft/FluidFramework/issues/20329)) [f49f533](https://github.com/microsoft/FluidFramework/commit/f49f533a41a7bc1dbbf8b5f79e59b203904f426b)

    Creates a deep-er clone of the quorum members when snapshotting to make sure the snapshot is immutable.

-   Fix: configure user data scrubbing in checkpoints and summaries ([#20150](https://github.com/microsoft/FluidFramework/issues/20150)) [04a2cc9](https://github.com/microsoft/FluidFramework/commit/04a2cc9ee88d4dbfc14bf44320456aa01749990c)

    Added optional param, `scrubUserData`, to `ProtocolOpHandler.getProtocolState()`. When `true`, user data in the quorum is replaced with `{ id: "" }`. Defaults to `false`. Previously was always scrubbed.

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
