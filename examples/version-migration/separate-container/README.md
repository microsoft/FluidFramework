# @fluid-example/version-migration-separate-container

This example experiments with an approach for migrating data from an existing Fluid container into a new Fluid container which may have a different schema and code running on it.

Please note that the ideas explored here are experimental and under development. They are not yet recommended for broad use in production.

## Scenario

Once a Fluid container has been created, it will contain some set of persisted data in the form of the summary as well as any unsummarized ops. This persisted data can only be correctly interpreted by a compatible container code (typically the same one that created it, or a newer but backwards-compatible one). This container code knows the appropriate data stores to load to interpret the summary and process the outstanding ops, as well as provides public access to those data stores for use.

However, suppose you want to change your application's schema in a manner that is not backwards compatible. Examples of this might include:

-   Changing a DDS type used to store some data (e.g. Cell -> Map as this example demonstrates)
-   Removing a piece of the data that is no longer relevant (e.g. for an app feature that has been removed)
-   Reorganize data (e.g. split Directory data into subdirectories, or change the key used for a value in a Map)

## Strategy overview

This example explores one technique to permit these types of changes. It employs a multi-stage process to do so:

1. Reach consensus amongst connected clients to perform the migration
1. Extract the data from the existing container
1. Transform the data as needed (optional)
1. Create a new container with the new code and import the transformed data
1. Redirect clients to the new container

### Reach consensus amongst connected clients to perform the migration

At any given moment, connected clients may have data in flight - ops that are unsequenced or that not all other clients are aware of. To avoid losing this data during the migration, we use a PactMap DDS to partition the op stream and establish the version we are migrating to. Ops sent before the PactMap value acceptance will be included, and clients are expected to stop generating ops after observing the proposal. After the PactMap value is accepted, late-arriving ops are not guaranteed to be included in the migration. Applications are recommended to block further edits to the data at this point to avoid the risk of losing those edits.

### Extract the data from the existing container

The container model is expected to provide a mechanism to export the data from within for migration purposes. The format of the exported data is up to the model - it could be a string, JSON, some well known file format like .csv, etc. Complex Javascript objects could even be used (since we will be performing the data import locally), but some serializable format is probably the most durable option.

### Transform the data as needed (optional)

If the new model is incapable of importing the export format of the old model, the format should be transformed accordingly. This can be skipped if the exported format is directly consumable by the new model.

### Create a new container with the new code and import the transformed data

With the exported and transformed data in hand, we can create a new container using the new container code and import the data. We ideally only upload (attach) a single migrated container, since duplicative containers are wasted storage. To minimize duplication, we use a TaskManager to select a single volunteer. Once the container is attached, we write the new container's id into the old container (using a ConsensusRegisterCollection) to finalize the migration. This write lets other clients know the migration is complete and the data has been migrated to the specified container.

### Redirect clients to the new container

As clients observe the migration complete, they load the new container and swap it in for the old one. This includes loading in the approporate new container code. Once complete, the client can begin collaborating on the new container.

<!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:usesTinylicious=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

You can run this example using the following steps:

1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.
1. Run `pnpm install` and `pnpm run build:fast --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `pnpm run build:fast --nolint @fluid-example/version-migration-separate-container`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious).
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

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
