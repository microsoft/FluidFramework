# clicker-react

**Clicker-React** contains two Fluid objects that use the new experimental Fluid React data object and hooks. These can be found in the @fluidframework/react package.

**clicker-function** shows how to create a simple Clicker example using no DDSes by just calling the useSyncedObject hook.

The **clicker-react** example uses the FluidReactView which is a wrapper around the traditional React component that allows you to use synced state updates the same way you would use local state updates in React.

i.e. in React, reading the counter value would be done by state.value and incrementing it would be done by setState({value: state.value + 1}). Now, we can expect the same state.value to be incremented without any event listening for the change


Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.

**clicker-hook** shows how to achieve the same result as **clicker-react**, but by simply calling the the available useSyncedCounter hook to get a SharedCounter powered view. This shows how easy it is to set up functional views powered by DDSes.

**clicker-reducer**, and **clicker-context** examples respectively show how to create the same Clicker using the other two available hooks, useReducerFluid, and createContextFluid.
