<!-- markdown-magic:begin {"transform":"example-getting-started","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
2. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
   * For an even faster build, you can add the package name to the build command, like this:
     `pnpm run build:fast --nolint @fluidframework/test-package`
3. In a separate terminal, start a Tinylicious server by running `pnpm tinylicious` in this directory.
4. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.
5. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
6. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

<!-- markdown-magic:begin {"transform":"example-getting-started","headingLevel":2,"usesTinylicious":false} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
2. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
   * For an even faster build, you can add the package name to the build command, like this:
     `pnpm run build:fast --nolint @fluidframework/test-package`
3. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
4. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->
