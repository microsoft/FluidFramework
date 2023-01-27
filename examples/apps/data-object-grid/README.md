# @fluid-example/data-object-grid

**Data object grid** is a Fluid component that provides a grid layout for users to compose their own experiences by adding and re-arranging data objects. This example explores how modular document types could work in Fluid.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->

<!-- prettier-ignore-start -->

<!-- This section is automatically generated. To update it, make the appropriate changes to docs/md-magic.config.js or the embedded content, then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Install [pnpm](https://pnpm.io/) by running `npm i -g pnpm`.
1. Run `pnpm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/data-object-grid`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm start` from this directory (examples/apps/data-object-grid) and open <http://localhost:8080> in a web browser to see the app running.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Data objects

The data-object-grid package pulls in a collection of outside data objects into a registry that enables creation and constructing views. This isolates the knowledge of how to create and render the data objects away from the core application, and makes it extensible to further data object types.
