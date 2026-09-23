# @fluid-example/example-utils

This package contains utilities used by Fluid examples. These interfaces can be extended by Fluid objects in the examples, but are not intended for use in production scenarios.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

## SEA Example Selection

`getExampleServiceClient` retains its synchronous contract and existing default/session/ephemeral/Tinylicious behavior.
The explicit `sea-ephemeral`, `sea-webtransport`, and `sea-websocket` query selections return a Fluid ServiceClient whose first attachment or load initializes SEA asynchronously.
Detached creation opens no SEA session, and non-SEA selections fetch no SEA WASM.
The SEA setup module owns the loader-preset choice; `exampleAppConfig` supplies `--env seaPreset=split|combined` at build time, defaulting to split.
The package's public example entrypoint does not expose generated paths or transport-specific data stores.

WebTransport configuration uses an HTTPS `seaEndpoint` and `seaCertificateHash`; optional `seaCompression=true` must match across peers.
WebSocket configuration uses a WSS `seaEndpoint` and the dedicated socket artifact, independent of the split/combined preset.
It does not require a certificate hash and does not support `seaCompression=true`.
Missing or invalid remote settings fail explicitly without selecting another service.
Local storage belongs to the returned client for the page lifetime and is not shared across independent calls or windows.
See the [inventory guide](../../data-objects/inventory-app/README.md#sea-services) for prerequisites, lifetime limits, launch commands, and browser acceptance evidence.

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->
<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

- Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
- [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
- Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
- [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->
<!-- markdown-magic:end -->
