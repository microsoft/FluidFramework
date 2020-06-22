# Clicker React

**clicker-react** contains six different Clicker Fluid components that use the new experimental Fluid React component and hooks. These can be found in the **@fluidframeworks/react** package.

They all achieve the same end result, but use different extensions of concepts that should be analogous to any React developer.

React.PureComponent &rarr; PureFluidReactComponent
React.Component &rarr; FluidReactComponent
useState &rarr; useStateFluid
useReducer &rarr; useReducerFluid
createContext &rarr; createContextFluid

While some are almost identical in appearance to their React counterparts, i.e. useState and useStateFluid, others are slightly different in their interface design from their React counterparts, to account for additional Fluid behavior. But the scenarios in which they are used, and the manner in which they are used are analogous.

i.e. PureFluidReactComponent is a child class of FluidReactComponent's behavior that allows developers to build using a simpler basic component unit, similar to the relationship between React.Component and React.PureComponent. useReducerFluid is likewise built for larger applications to help manage their data when useStateFluid is not sufficient, similar to when developers decide to use useReducer over useState.

**All of these examples showcase different tools that a user can take advantage of to build their Fluid components. These tools can be intermixed at will, similar to how functional and classical React components are inter-mixable. For example, views can hold a PureFluidReactComponent, FluidReactComponent, and a FunctionalReactComponent side-by-side. You can also have them live alongside any existing non-Fluid React component, allowing Fluid powered views to be injected into existing React applications today, using the power of context. Furthermore, these views can also be introduced in any Fluid component that is being powered by a PrimedComponentFactory and use any DDS that the developer wants to power the views with. This allows developers to pick their tool based on the complexity of the component they are building, while remaining extensible for future demands.**

1) The simplest component in this folder, and the best place to start. is **clicker-simple-react**. It has no dependencies to any other packages in this folder, and serves as an example of the simplest component you can build that still has full React functionality, but now has a synced state instead of only a local one.

    Clicker here is a PureFluidReactComponent, an extension of FluidReactComponent and React.Component. The React state is now powered using a synced Fluid SharedMap. It allows you to use synced state updates the same way you would use local state updates in React. It differs from FluidReactComponent in that the view and Fluid states are now the same, instead of being uniquely defined. However, the combined state can hold both primitives and DDS'. We will look at primitives in example 1, DDS' in example 2, and how to use one in the view and the other in the data store in example 3.

    React view developers can access state, setState, and any lifecycle methods, but all state updates will be automatically applied to all connected clients, in sync. This is the easiest component for any Fluid newcomer to start with as there are no exposed Distributed Data Structures, Fluid component lifecycle methods, handles, or any event listeners.

    i.e. in React, reading the counter value would be done by state.value and incrementing it would be done by setState({value: state.value + 1}). Now, we can expect the same state.value to be incremented without any event listening for the change

    Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.

    However, this is purely powered using a SharedMap and is simply setting the primitive values on it. If your scenarios involve two people actively manipulating the values simultaneously, you will start seeing bugs. For these, we need to start replacing primitives in our state with SharedObjects, i.e. a SharedCounter for Clicker, SharedString for any strings, etc.

    To start adding your own SharedObjects to this map, **you can still use a PureFluidReactComponent**. Simply define the SharedObject needed in the fluidToView map, add it to the factory, and pass its Create function as seen in example 2.

    If you'd like to have separate view and Fluid states, where the view has no Fluid objects even though the syncing logic is being powered by DDS', please look at example 3 where we achieve this using PureFluidReactComponent's parent class, FluidReactComponent.

2) **clicker-react** would be the next component to look at for a Fluid newcomer. It still uses the same PureFluidReactComponent from before, but now introduces using a SharedCounter on the state. This is made available by setting a fluidToView map on our syncedStateConfig. We still have all of our state, setState functionality from before, but now it has SharedCounter's logic for allowing multiple people to simultaneously increment. And our counter still triggers automatic React re-renders when others update it.

3) **clicker-react-impure** now introduces the concept of separate view and Fluid states. This allows the view to be built without interacting with any Fluid shared objects, while still capitalizing on the unique syncing logic of each DDS. This is possible due to the introduction of the viewToFluid map, where users can set up logic to trigger Fluid updates based off of view state changes.

    As you can see in **view.tsx**, the view still updates using
    `this.setState({value: this.state.value + 1})`, just like a regular React state update, but the actual update itself gets powered using a SharedCounter incrementing. This SharedCounter is completely abstracted away from the view. The logic to translate the view update to the Fluid DDS lives in the fluidConverter in the viewToFluid map.

4) **clicker-functional** brings with it our support for React hooks! In this case, we use the useStateFluid hook to achieve the same goal as our **clicker-react-impure** example, but now as a functional component. We still have a view state with only a primitive number, even though it is being powered by a SharedCounter.

5) **clicker-reducer** shows how Clicker could be written in a scalable manner by using the useReducerFluid hook. Here, we set up a reducer that allows the view to dispatch the action to increment the counter, rather than directly interact with it. This shows how Fluid components could scale with more complex data store requirements.

6) Finally, **clicker-context** shows how we can pass use React.Context in combination with our useFluidReducer hook to completely abstract away any Fluid dependency from the view itself. **This allows a React developer to inject a Fluid-powered application into any existing React application, as long as there is some higher layer that primes the context and passes the reducer dispatch functions.** To show how this can be applied in real-world applications with multiple component/container layers, this example is broken up into four parts:

    - **component.tsx** - This contains the Fluid component itself and will normally be the code will run as part of a production application's data store initializing procedure. From here it can pass the syncedComponent reference to the container.

    - **container.tsx** - This contains the priming code for the context. It now calls our useFluidReducer hook to prepare our synced state and dispatch functions. These are then passed into the context provider for our PrimedContext.

    - **context.tsx** - This stores the PrimedContext constant so that it can be referenced throughout the app

    - **view.tsx** - This contains the view, by itself, with no reference to Fluid, but rather only to our PrimedContext.

**clicker-common** contains the maps and reducers that these views consumer.
**clicker-definitions** contains the interfaces the views, reducers, and maps the different Clicker implementations consume.
**clicker-common** has no dependencies on the views or components themselves, allowing them to be developed as a standalone package. The only thing linking the view and this together are the definitions.

TODO:
**createContextFluid** - There is also a createContextFluid hook in the Fluid-React library that is analogous to the createContext React hook. However, this still needs to be developed further before it is ready for consumption. For now, please look **clicker-context** to use the useReducerFluid and React.createContext functions to achieve a similar goal.
