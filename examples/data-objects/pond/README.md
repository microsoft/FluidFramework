# @fluid-example/pond

The pond is a collection of simple Fluid scenarios used primarily for testing.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/pond`
1. Run `npm run start` from this directory (examples/data-objects/pond) and open <http://localhost:8080> in a web browser to see the app running.
<!-- AUTO-GENERATED-CONTENT:END -->

## Internal Fluid Object Examples

### [Clicker](./src/data-objects/clicker.tsx)

Similar to the `@fluid-example/clicker` but renders two clickers. One using the `this.root`
SharedDirectory and the other using a newly created SharedMap that is stored on the root.

### [ExampleUsingProviders](./src/data-objects/exampleUsingProviders.tsx)

An example that uses Container Providers to get an render current user information. This information
will only be rendered if the Container provides a Provider for `IFluidUserInformation`.

### [Pond](./src/index.tsx)

The Pond renders all three of the above Fluid Objects.

The Container logic also initializes the UserInfo Provider below.

## Internal Provider Examples

### [UserInfo Provider](./src/providers/userInfo.ts)

An example Container Provider that implements the `IFluidUserInformation` interface.

## Container Definition

The container is defined in src/index.tsx
