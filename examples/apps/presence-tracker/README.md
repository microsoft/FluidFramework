# @fluid-example/presence-tracker

**_This demo is a work-in-progress_**

**Presence Tracker** is an example that demonstrates how transient state of audience members can be tracked among other audience members using signals. It does so using fluid-framework's `FluidContainer`, `IServiceAudience`, and `Signaler`.

This implementation visualizes the Container in a standalone application, rather than using the webpack-fluid-loader environment that most of our examples use. This implementation relies on [Tinylicious](/server/tinylicious), so there are a few extra steps to get started. We bring our own view that we will bind to the data in the container.

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/presence-tracker`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious).
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
