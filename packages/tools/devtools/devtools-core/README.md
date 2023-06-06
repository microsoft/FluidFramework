# @fluid-experimental/devtools-core

This library contains developer tools for use alongside the Fluid Framework.
It is used to power our associated browser extensions.

TODO: link to extensions once they are published.

<!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-experimental/devtools-core -D
```

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Usage

The Devtools' API surface is designed to fit nicely into most application flows.

### Initialization

To initialize a debugger session for your container, call `initializeDevtools`.
This function accepts a `DevtoolsLogger` for recording and communicating telemetry data, a list of initial Fluid `Containers` to associate with the session, and (optionally) customized data visualization configurations for visualizing `Container` data.

TODO: link to API docs once API shape has settled.

### Clean-up

The Devtools object is managed as a global singleton.
That singleton is automatically cleaned up prior to the Window's "unload" event.
So typical application flows likely won't need to worry about cleanup.
That said, if you wish to have tighter control over when the Devtools are torn down, you can simply call the `dispose` method on the handle returned by [initialization](#initialization).

## Related Tooling

This library is designed to work alongside our Chromium browser extension.

TODO: link to code on github once package names have been finalized.
TODO: link to the various browsers' webstore pages for our extension once it has been publiched.

## Working in the package

### Build

To build the package locally, first ensure you have run `pnpm install` from the root of the mono-repo.
Next, to build the code, run `npm run build` from the root of the mono-repo, or use [fluid-build](https://github.com/microsoft/FluidFramework/tree/main/build-tools/packages/build-tools#running-fluid-build-command-line) via `fluid-build -t build`.

-   Note: Once you have run a build from the root, assuming no other changes outside of this package, you may run `npm run build` directly within this directory for a faster build.
    If you make changes to any of this package's local dependencies, you will need to run a build again from the root before building again from directly within this package.

### Test

To run the tests, first ensure you have followed the [build](#build) steps above.
Next, run `npm run test` from a terminal within this directory.

<!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## API Documentation

API documentation for **@fluid-experimental/devtools-core** is available at <https://fluidframework.com/docs/apis/devtools-core>.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README? Check out our [GitHub
Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an
issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
