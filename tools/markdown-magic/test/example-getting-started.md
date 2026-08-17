<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_GETTING_STARTED:headingLevel=2) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluidframework/test-package`
1. In a separate terminal, start a Tinylicious server by running `pnpm tinylicious` in this directory.
1. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_GETTING_STARTED:headingLevel=2&usesTinylicious=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluidframework/test-package`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.
1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_GETTING_STARTED:headingLevel=2&serviceClient=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluidframework/test-package`
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser. The app uses an ephemeral in-browser service by default and stores the container ID in the URL hash.
1. To retain data across reloads in the current browser tab, run `pnpm start:session` and open <http://localhost:8080/?fluidClient=session>.
1. To share data between browser sessions, start Tinylicious in a separate terminal by running `pnpm tinylicious` in this directory, then run `pnpm start:tinylicious` and open <http://localhost:8080/?fluidClient=tinylicious>. In GitHub Codespaces, set the forwarded Tinylicious port 7070 visibility to **Public** before opening the app.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
