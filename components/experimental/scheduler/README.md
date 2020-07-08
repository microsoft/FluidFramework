# @fluid-example/scheduler

**scheduler** is an example demonstration of the capabilities of the **@fluidframeworks/react** library. It is a more involved example than those in **clicker-react**  and consists of multiple different state definitions, a number of different DDS', and a combined application of useReducerFluid and its joint usage with React context providers & consumers.

**component.tsx** - Contains the Fluid component, factory, and export. This sets up the SyncedComponent config for the application and passes it to the container

**container.tsx** - Contains the container responsible for linking the SyncedComponent being passed in to the view. This where the reducers for the people and comment states are bound before being passed into the context provider.

**view.tsx** - Contains the pure functional React view whose sole job is to render the Fluid data and call dispatch functions to modify it. There is no business logic here, only rendering logic.

**context.tsx** - Sets up a primed context that will be filled in by the container and consumed by the view.

**data/maps.ts** - Contains the FluidToView and ViewToFluid maps that the React view will use to bind to the synced Fluid state.

**data/reducers.ts** - Contains all of the reducers functions that are actually modifying the Fluid and view states. This is where the addition of new SharedObjects that were not originally in the schema is also happening.

**data/constants.ts** - Contains constant values used by the view

**data/index.ts** - Labels the data exports

**interface.tsx** - Stores the definitions used throughout the app

**index.tsx** - Labels the package exports
