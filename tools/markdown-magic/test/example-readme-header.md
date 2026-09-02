<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:packageJsonPath=./package.json) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
1. From the `FluidFramework` root directory, run `pnpm install`.
1. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
    - To build only this package, add the package name to the command:
      `pnpm run build:fast --nolint @fluidframework/test-package`
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
