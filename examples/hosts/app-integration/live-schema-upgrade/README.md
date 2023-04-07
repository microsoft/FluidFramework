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

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/app-integration-live-schema-upgrade`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious).
1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```
