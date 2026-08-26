# @fluid-example/app-integration-live-schema-upgrade

This example experiments with an approach for upgrading the schema on a container without disposing it.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production.

## Scenario

Once a Fluid container has been created, it will contain some set of persisted data in the form of the summary as well as any unsummarized ops. This persisted data can only be correctly interpreted by a compatible container code (typically the same one that created it, or a newer backwards-compatible one). This container code knows the appropriate data stores to load to interpret the summary and process the outstanding ops, as well as provides public access to those data stores for use.

However, suppose you want to change your application's schema by adding an additional data object, but you don't want to migrate all of the existing container data to a brand new container.

## Strategy overview

There are two main approaches to this problem:

1. Use the latest container schema when creating new containers. For any existing containers, wait for all users to disconnect that were running the previous version. Once all users of the previous schema are disconnected, one of the clients with the latest container schema can upgrade the container to enable the new functionality.
2. As soon as a user with the new container schema connects to an existing container they immediately upgrade the container and forcefully disconnect (close the container) of any connected clients with the old schema.

For this example, we will be demonstrating approach 2.

### View

There are a number of ways to handle rendering the view. In this example, we include a single view that is compatible with both versions of the model. Although this is a valid approach, it may not scale well as the number of versions increases. Some alternative approaches could be to:

-   Include multiple views and render the appropriate one based on the schema version.
-   Load the appropriate view after the model is instantiated.
-   Only include the latest view and ensure that the model upgrades before rendering.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
1. From the `FluidFramework` root directory, run `pnpm install`.
1. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
    - To build only this package, add the package name to the command:
      `pnpm run build:fast --nolint @fluid-example/app-integration-live-schema-upgrade`
1. In a separate terminal, run `pnpm tinylicious` from this directory to start Tinylicious.
1. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).
1. Run `pnpm start` from this directory.
1. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
1. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
1. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Testing

```bash
npm run test:playwright
```

To run the tests in a visible browser with the Playwright inspector:

```bash
npm run test:playwright -- --headed --debug
```

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
