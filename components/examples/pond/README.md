# @fluid-example/pond

The pond is a collection of simple fluid scenarios used primarily for testing.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Internal Component Examples

### [Clicker](./src/internal-components/clicker.tsx)

Similar to the `@fluid-example/clicker` but renders two clickers. One using the `this.root`
SharedDirectory and the other using a newly created SharedMap that is stored on the root.

### [ClickerWithInitialValue](./src/internal-components/clickerWithInitialValue.tsx)

Another clicker example but one that allows for optional initial state to be passed into
the component.

### [ExampleUsingProviders](./src/internal-components/exampleUsingProviders.tsx)

An example that uses Container Providers to get an render current user information. This information
will only be rendered if the Container provides a Provider for `IComponentUserInformation`.

### [Pond](./src/index.tsx)

The Pond renders all three of the above components.

The Container logic also initializes the UserInfo Provider below.

## Internal Provider Examples

### [UserInfo Provider](./src/providers/userInfo.ts)

An example Container Provider that implements the `IComponentUserInformation` interface.
