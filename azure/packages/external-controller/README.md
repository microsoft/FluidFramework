# @fluid-example/app-integration-external-controller

**_This demo is a work-in-progress_**

**Dice Roller** is a basic example that has a die and a button. Clicking the button re-rolls the die and persists
the value in the root SharedDirectory. The Fluid Container is defined in container/, the data object is defined in dataObject/.

This implementation demonstrates plugging that Container into a standalone application, rather than using the
`webpack-fluid-loader` environment that most of our packages use. This implementation relies on
[Tinylicious](/server/tinylicious), so there are a few extra steps to get started. We bring our own view that we will
bind to the data in the container.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-external-controller`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm start` from this directory (azure/packages/external-controller) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Help

Not finding what you're looking for in this README?
Check out our [GitHub Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).
Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
