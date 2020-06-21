# @fluidframework/clicker-react-nonunified

**clicker-react-nonunified** introduces the concept of separate view and Fluid states. This allows the view to be built without interacting with any Fluid shared objects, while still capitalizing on the unique syncing logic of each DDS. This is possible due to the introduction of the viewToFluid map, where users can set up logic to trigger Fluid updates based off of view state changes.

As you can see in **view.tsx**, the view still updates using
`this.setState({value: this.state.value + 1})`, just like a regular React state update, but the actual update itself gets powered using a SharedCounter incrementing. This SharedCounter is completely abstracted away from the view. The logic to translate the view update to the Fluid DDS lives in the fluidConverter in the viewToFluid map.

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

