# @fluid-example/pond

The pond is a collection of simple Fluid scenarios used primarily for testing.

## Getting Started

If you want to run this container follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

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
