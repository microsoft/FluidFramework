# clicker-react

**Clicker-React** contains two Fluid components that use the new experimental Fluid React component and hooks. These can be found in the @fluidframeworks/react package.


The **clicker-react** uses the FluidReactComponent which is a wrapper around the traditional ReactComponent that allows you to use synced state updates the same way you would use local state updates in React.


i.e. useReducerFluid is built for larger applications to help manage their data when useStateFluid is not sufficient, similar to when developers decide to use useReducer over useState.

**All of these examples showcase different tools that a user can take advantage of to build their Fluid components. These tools can be intermixed at will, similar to how functional and classical React components are inter-mixable. For example, views can hold a FluidReactComponent and a FunctionalReactComponent side-by-side. You can also have them live alongside any existing non-Fluid React component, allowing Fluid powered views to be injected into existing React applications today, using the power of context. Furthermore, these views can also be introduced in any Fluid component that is being powered by a PrimedComponentFactory and use any DDS that the developer wants to power the views with. This allows developers to pick their tool based on the complexity of the component they are building, while remaining extensible for future demands.**

Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.


4) **clicker-functional** brings with it our support for React hooks! In this case, we use the useStateFluid hook to achieve the same goal as our **clicker-react** example, but now as a functional component. We still have a view state with only a primitive number, even though it is being powered by a SharedCounter.

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
**createContextFluid** - There is also a createContextFluid hook in the Fluid-React library that is analogous to the createContext React hook. However, this still needs to be developed further before it is ready for consumption. For now, please look at **clicker-context** to see how to use the useReducerFluid and React.createContext functions to achieve a similar goal.
