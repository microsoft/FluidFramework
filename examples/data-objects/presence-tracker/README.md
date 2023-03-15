# @fluid-example/presence-tracker

**_This demo is a work-in-progress_**

**Presence Tracker** is an example that demonstrates how transient state of audience members can be tracked among other audience members using signals. It does so using fluid-framework's `FluidContainer`, `IServiceAudience`, and `Signaler`.

This implementation visualizes the Container in a standalone application, rather than using the webpack-fluid-loader environment that most of our examples use. This implementation relies on [Tinylicious](/server/tinylicious), so there are a few extra steps to get started. We bring our own view that we will bind to the data in the container.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/presence-tracker`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm start` from this directory (examples/data-objects/presence-tracker) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
