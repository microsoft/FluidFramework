# @fluidframework/server-lambdas

## 4.0.1

### Patch Changes

-   Fix: send correct connection scopes for client ([#20312](https://github.com/microsoft/FluidFramework/issues/20312)) [e227db9](https://github.com/microsoft/FluidFramework/commit/e227db94bcab68e05087526c02ea4cca02ee4cea)

    When a client joins in "write" mode with only "read" scopes in their token, the connection message from server will reflect a "read" client mode.

-   Fix: configure user data scrubbing in checkpoints and summaries ([#20150](https://github.com/microsoft/FluidFramework/issues/20150)) [04a2cc9](https://github.com/microsoft/FluidFramework/commit/04a2cc9ee88d4dbfc14bf44320456aa01749990c)

    When scribe boots from a checkpoint, it fails over to the latest summary checkpoint if the quorum is corrupted (i.e. user data is scrubbed).
    When scribe writes a checkpoint to DB or a summary, it respects new `IScribeServerConfiguration` options (scrubUserDataInSummaries, scrubUserDataInLocalCheckpoints, and scrubUserDataInGlobalCheckpoints) when determining whether to scrub user data in the quorum.

-   Fix: cover edge cases for scrubbed checkpoint users ([#20259](https://github.com/microsoft/FluidFramework/issue/20259)) [6718a9a](https://github.com/microsoft/FluidFramework/commit/6718a9a1707d6a5bcc573acbb2d154b8840c4b72)

    Overhauled how the Scribe lambda handles invalid, missing, or outdated checkpoint data via fallbacks.

    Before:

    ```
    if (no global checkpoint)
        use Default checkpoint
    elsif (global checkpoint was cleared or global checkpoint quorum was scrubbed)
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
        use latest DB checkpoint (local or global)
    ```

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
