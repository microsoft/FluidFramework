# @fluidframework/clicker-simple-react

The simplest component in this folder, and the best place to start. is **clicker-simple-react**. It has no dependencies to any other packages in this folder, and serves as an example of the simplest component you can build that still has full React functionality, but now has a synced state instead of only a local one.

Clicker here is a PureFluidReactComponent, an extension of FluidReactComponent and React.Component. The React state is now powered using a synced Fluid SharedMap. It allows you to use synced state updates the same way you would use local state updates in React. React view developers can access state, setState, and any lifecycle methods, but all state updates will be automatically applied to all connected clients, in sync. This is the easiest component for any Fluid newcomer to start with as there are no exposed Distributed Data Structures, Fluid component lifecycle methods, handles, or any event listeners.

i.e. in React, reading the counter value would be done by state.value and incrementing it would be done by setState({value: state.value + 1}). Now, we can expect the same state.value to be incremented without any event listening for the change

Similarly, the SharedCounter's value can be read using state.counter.value and incremented by state.counter.increment(). At this point, state.counter.value automatically holds the new value with no event-listening necessary.

However, this is purely powered using a SharedMap. To start adding your own SharedObjects to this map, you can still use a PureFluidReactComponent. Simply define the one needed in the fluidToView map and pass its Create function as seen in **clicker-react**.

If you'd like to have separate view and Fluid states, where the view has no Fluid objects even though the syncing logic is being powered by DDS', please look at **clicker-react-nonunified** where we achieve this using PureFluidReactComponent's parent class, FluidReactComponent.

## Getting Started

If you want to run this component follow the following steps:

1. Run `npm install` from the `FluidFramework` root directory
2. Navigate to this directory
3. Run `npm run start`

## Testing

```bash
    npm run test:jest
```

For in browser testing update `./jest-puppeteer.config.js` to:

```javascript
  launch: {
    dumpio: true, // output browser console to cmd line
    slowMo: 500,
    headless: false,
  },
```

