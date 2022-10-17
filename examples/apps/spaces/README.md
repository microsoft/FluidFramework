# @fluid-example/spaces

**Spaces** is a Fluid component that provides a grid layout for users to compose their own experiences by adding and re-arranging components. This example explores how modular document types could work in Fluid.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/spaces`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/apps/spaces) and open <http://localhost:8080> in a web browser to see the app running.

<!-- AUTO-GENERATED-CONTENT:END -->

## Components

The spaces package pulls in a collection of outside components and also has a few internal components that can be found at `./src/components`. The internal components simply offer more functionality for prototyping.

## Template

Template allows you to save and re-use a layout. When you click the `Template` button it will save the current layout. If you want to create a new document with the same layout add the `?template` to the url when creating a new doc.
