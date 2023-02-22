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

## Other concepts

This example also explores other concepts that are new but not core to the migration process.

### Container model

In many other examples, we use a "root/default data object" concept (Spaces is a good example, pretty much all of the /examples/data-objects examples as well). The root data object exposes the API that the container wants to expose to the app (host). However, accessing this API is indirect, as the app must first retrieve this data object from the IContainer using `container.request()`.

The container model concept introduced in this example serves a similar purpose of exposing an API for the app, but does so by wrapping the IContainer rather than living inside it as a data object. This removes a layer of indirection for the app, who can load this model directly (see next section). The app can then start using the API surface immediately without the extra step of going through the request pattern.

When the container API surface has been externalized from the container, this can also open up new options for how the data might be represented and organized. There's no longer a need to craft a data object that holds references to all the container's contents if it's not required for the scenario. In this example, the model code knows how to access the DiceRoller and DiceCounter data objects, but these two objects remain completely separate from each other in the data schema.

### Model loading

As mentioned above, the `ModelLoader` is able to load directly to a container model. To do this, it wraps a `Loader` to load containers, and uses an `IModelCodeLoader` (similar to the `ICodeDetailsLoader` used in the Container) to match the model code against the container code. This extra code loader is required because the model code must be compatible with the container code within. The model code loader is also the opportunity to run any further async initialization steps that are needed to present the correct API surface on the model (e.g. retrieving handles to have important data available synchronously).

### View loading

Similarly, the view used on a model must be compatible with that model. A view loader can inspect the model and load the appropriate view. This portion is still under development, but will likely be similar to the model loading flow.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-external-views`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm start` from this directory (examples/hosts/app-integration/external-views) and open <http://localhost:8080> in a web browser to see the app running.

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
