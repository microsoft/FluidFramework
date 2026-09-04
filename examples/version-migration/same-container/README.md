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

<!-- markdown-magic:begin {"transform":"example-app-readme-header","usesTinylicious":true,"headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
   * To build only this package, add the package name to the command:
     `pnpm run build:fast --nolint @fluid-example/version-migration-same-container`
4. In a separate terminal, run `pnpm tinylicious` from this directory to start Tinylicious.
5. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).
6. Run `pnpm start` from this directory.
7. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
2. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
3. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

## Testing

```bash
npm run test:playwright
```

To run the tests in a visible browser with the Playwright inspector:

```bash
npm run test:playwright -- --headed --debug
```

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

* Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
* [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
* Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->
