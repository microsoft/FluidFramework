# React

The Fluid Frameworks React package provides the base hooks and component class for building React components that uses a synced state provided by Fluid. Its goal is to make it very easy for a React developer to build large, scalable React apps with synced Fluid components.

## Fluid React Component

This is the base level Fluid React Component that offers a synced view state and a mapping between the view and synced state stored in the root. This should be used for creating small-scale React apps that don't involve complex nested Fluid components or data management systems. All values that are set in the state of this component are automatically also set on the root and passed to other clients rendering this component in the same session.

## useStateFluid

This is analagous to the React component but as a functional hook. Users can similarly use the returned setState callback to perform synced updates to both their local and synced states.

## useReducerFluid

This is the hook of choice for larger-scale applications that require more complex mutations, need to work with multiple Fluid components, and need to have a division between data and view models. Here, instead of having only the view state to manipulate, users have both the view state and the fluid state, with the former containing primitives used for rendering and the latter containing Fluid components to manipulate data in a synced manner. This hook also introduces the concept of a local FluidComponentMap that stores and listens to changes on already fetched components.


Reducers offer ways of mutating the state whereas selectors offer ways of fetching data from other components. When either involves the addition of new components locally, these are added to the FluidComponentMap so that they can be accessed by the view synchronously.


Any updates to the root state are converted to updates in the view using the provided fluidConverters in the fluidToView map, and vice versa. This allows changes locally to reflect on the root, and root changes to also be translated back to local state updates.

## createContextFluid

This hook is for users who want to be able to easily create a context with provider and consumer that pass the root and initial state through their app.


This hook calls useStateFluid and returns the state and setState values back to be used as part of the initial values passed down by the provider and used by a consumer


Essentially, this allows that portion of the root state to be manipulated through different levels of a React app, giving apps the ability to have multiple different views manipulate the same data not only throughout the app but through all renders of the app on different clients
