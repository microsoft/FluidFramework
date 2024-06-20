# @fluidframework/server-services-client

## 5.0.0

### Minor Changes

-   server-services-client: Add optional internalErrorCode property to NetworkError and INetworkErrorDetails ([#21465](https://github.com/microsoft/FluidFramework/pull/21465)) [9427e25689](https://github.com/microsoft/FluidFramework/commit/9427e2568924e0bed83d2a6f78a6e2a20be8a29e)

    `NetworkError`s now include an optional property, `internalErrorCode`, which can contain additional information about
    the internal error.

    You can find more details in [pull request #21429](https://github.com/microsoft/FluidFramework/pull/21429).

## 4.0.0

### Major Changes

-   RestWrapper querystring types narrowed ([#19624](https://github.com/microsoft/FluidFramework/issues/19624)) [41ac3dbecf](https://github.com/microsoft/FluidFramework/commits/41ac3dbecf4325384231fb2e67ef64bd40a47c4a)

    The acceptable values for the querystrings passed to RestWrapper must be string | number | boolean (previously accepted unknown). Other values cannot be successfully stringified and so should be avoided.

## 3.0.0

### Major Changes

-   Use RawAxiosRequestHeaders instead of AxiosRequestHeaders in BasicRestWrapper constructor. [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `BasicRestWrapper` class constructor now uses `RawAxiosRequestHeaders` from the `axios` package instead of `AxiosRequestHeaders`. This applies to both the `defaultHeaders` and `refreshDefaultHeaders` arguments.

    This change was made in [#17419](https://github.com/microsoft/FluidFramework/pull/17419).

-   Updated @fluidframework/protocol-definitions ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   server-services-client: New `messageBrokerId` property added to `ISession` [817f661734](https://github.com/microsoft/FluidFramework/commits/817f66173489ffa920200c96f122416c9a044d66)

    The `ISession` interface was updated with new field `messageBrokerId` that would be assigned when message broker is set to Event Hubs.

-   server-services-client: New internal exports [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `@fluidframework/server-services-client` package now exports the following items. These APIs are intended for internal use within the Fluid Framework only. They will be marked as internal APIs in a future release.

    -   `ITimeoutContext`: Binds and tracks timeout info through a given codepath. The timeout can be checked manually to stop exit out of the codepath if the timeout has been exceeded.
    -   `getGlobalTimeoutContext`: Retrieves the global ITimeoutContext instance if available. If not available, returns a NullTimeoutContext instance which behaves as a no-op.
    -   `setGlobalTimeoutContext`: Sets the global ITimeoutContext instance.

    This change was made in [#17522](https://github.com/microsoft/FluidFramework/pull/17522).

-   Updated @fluidframework/common-utils ([#19090](https://github.com/microsoft/FluidFramework/issues/19090)) [ecd9e67b57](https://github.com/microsoft/FluidFramework/commits/ecd9e67b5748415ad93c6273047fdcca457b3a14)

    The @fluidframework/common-utils dependency has been upgraded to v3.1.0.
    [See the full changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/common-utils/CHANGELOG.md#310)
