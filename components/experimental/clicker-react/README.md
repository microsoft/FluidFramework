# Clicker-React

**Clicker-React** contains two Fluid components that use the new experimental Fluid React component and hooks. These can be found in the @fluidframeworks/react package.


The **clicker-react** uses the FluidReactComponent which is a wrapper around the traditional ReactComponent that allows you to use synced state updates the same way you would use local state updates in React.


i.e. in React, reading the counter value would be done by state.value and incrementing it would be done by setState({value: state.value + 1}). Now, we can expect the same state.value to be incremented without any event listening for the change


Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.


The **clicker-with-hooks** example expands on this with the same example demonstrated using three different hooks, useFluidState, useReducerFluid, and createContextFluid.