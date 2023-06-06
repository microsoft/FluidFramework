# @fluid-example/version-migration-same-container

This example experiments with an approach for migrating data in an existing Fluid container to enable a different schema or code running on it. It does the migration within the same container, that is the container ID is the same before and after the migration completes.

## DISCLAIMER

Please note that the ideas explored here are experimental and under development. Do not use them in production. This README is not updated to reflect the current behavior as it is still in development.

## Scenario

Once a Fluid container has been created, it will contain some set of persisted data in the form of the summary as well as any unsummarized ops. This persisted data can only be correctly interpreted by a compatible container code (typically the same one that created it, or a newer backwards-compatible one). This container code knows the appropriate data stores to load to interpret the summary and process the outstanding ops, as well as provides public access to those data stores for use.

However, suppose you want to change your application's schema in a manner that is not backwards compatible. Examples of this might include:

-   Changing a DDS type used to store some data (e.g. Cell -> Map as this example demonstrates)
-   Removing a piece of the data that is no longer relevant (e.g. for an app feature that has been removed)
-   Reorganize data (e.g. split Directory data into subdirectories, or change the key used for a value in a Map)

## Strategy overview

TODO: Update this section to better reflect the same-container flow.

This example explores one technique to permit these types of changes. It employs a multi-stage process to do so:

1. Reach consensus amongst connected clients to perform the migration
1. Extract the data from the existing container
1. Transform the data as needed
1. Create a new container with the new code and import the transformed data
1. Redirect clients to the new container

### Reach consensus amongst connected clients to perform the migration

At any given moment, connected clients may have data in flight - ops that are unsequenced or that not all other clients are aware of. To avoid losing this data during the migration, we use a Quorum DDS to partition the op stream and establish the version we are migrating to. Ops sent before the Quorum value acceptance will be included, and clients are expected to stop generating ops after observing the proposal. After the Quorum value is accepted, we know there are no more ops in flight that should be included in the migration, and that the version we are migrating to is the one specified in the Quorum.

### Extract the data from the existing container

The container model is expected to provide a mechanism to extract the data from within for migration purposes. The format of the extracted data is up to the model - it could be a string, JSON, some well known file format like .csv, etc. Complex Javascript objects could even be used (since we will be performing the data import locally), but some serializable format is probably the most durable option.

### Transform the data as needed

If the new model is incapable of importing the export format of the old model, the format should be transformed accordingly. This can be skipped if the exported format is directly consumable by the new model.

### Create a new container with the new code and import the transformed data

With the exported and transformed data in hand, we can create a new container using the new container code and import the data. We ideally only upload (attach) a single migrated container, since duplicative containers are wasted storage. We use a TaskManager to select a single volunteer for this purpose. Once the container is attached, we write the new container's id into the old container (using a ConsensusRegisterCollection) to finalize the migration - all clients can now know the migration is complete and the data has been migrated to the specified container.

### Redirect clients to the new container

As clients observe the migration complete, they load the new container and swap it in for the old one. This includes loading in the approporate new container code, model code, and view code if necessary. Once complete, the client can begin collaborating on the new container.

<!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/version-migration-same-container`
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
