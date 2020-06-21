# clicker-react

**Clicker-React** contains five different Clicker Fluid components that use the new experimental Fluid React component and hooks. These can be found in the @fluidframeworks/react package.

They all achieve the same end result, but use different extensions of concepts that should be familiar to any React developer.

1) The simplest component in this folder, and the best place to start. is **clicker-simple-react**. It has no dependencies to any other packages in this folder, and serves as an example of the simplest component you can build that still has full React functionality, but now has a synced state instead of only a local one.

Clicker here is a UnifiedFluidReactComponent, an extension of FluidReactComponent and React.Component. The React state is now powered using a synced Fluid SharedMap. It allows you to use synced state updates the same way you would use local state updates in React. React view developers can access state, setState, and any lifecycle methods, but all state updates will be automatically applied to all connected clients, in sync. This is the easiest component for any Fluid newcomer to start with as there are no exposed Distributed Data Structures, Fluid component lifecyle methods, handles, or any event listeners.

i.e. in React, reading the counter value would be done by state.value and incrementing it would be done by setState({value: state.value + 1}). Now, we can expect the same state.value to be incremented without any event listening for the change

Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.

However, this is purely powered using a SharedMap. To start adding your own SharedObjects to this map, you can still use a UnifiedFluidReactComponent. Simply define the one needed in the fluidToView map and pass its Create function as seen in example 2.

If you'd like to have separate view and Fluid states, where the view has no Fluid objects but the latter does, please look at example 4 where we achieve this using the useReducerFluid hook.

2) **clicker-react** would be the next component to look at for a Fluid newcomer. It still uses the same UnifiedFluidReactComponent from before, but now introduces using a SharedCounter on the state.. We still have all of our state, setState functionality from before. And our counter still updates in sync with everyone and triggers automatic re-renders when others update it.

2) **clicker-react-nonunified** would be the next component to look at for a Fluid newcomer. It still uses the same UnifiedFluidReactComponent from before, but now introduces using a SharedCounter on the state.. We still have all of our state, setState functionality from before. And our counter still updates in sync with everyone and triggers automatic re-renders when others update it.

3) **clicker-functional** now introduces our support for React hooks! In this case, we use the useStateFluid hook to achieve the same goal as our earlier examples, but now as a functional component

4) **clicker-reducer** shows how Clicker could be written in a scalable manner by using the useReducerFluid hook. Here, we set up a reducer that allows the view to dispatch the action to increment the counter, rather than directly interact with it. This shows how Fluid components could scale with more complex data store requirements.

5) Finally, **clicker-context** shows how we can pass Fluid context across multiple component layers without needing to do prop drilling by using the createContextFluid hook.

**clicker-common** contains the maps and reducers that these views consumer.
**clicker-definitions** contains the interfaces the views consumer.
**clicker-common** has no dependencies on the views or components themselves, allowing them to be developed as a standalone package.

All of these examples showcase different tools that a user can take advantage of to build their Fluid components. These tools can be intermixed at will, as in React components themselves. For example, views can hold a UnifiedFluidReactComponent, FluidReactComponent, and a FunctionalReactComponent side-by-side. Furthermore, these views can also be introduced in any Fluid component that is being powered by a PrimedComponentFactory.
