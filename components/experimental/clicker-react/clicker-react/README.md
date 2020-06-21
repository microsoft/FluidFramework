# @fluid-example/clicker-react

**clicker-react** uses a PureFluidReactComponent and introduces using a SharedCounter on the state. This is made available by setting a fluidToView map on our syncedStateConfig. We still have all of our state, setState functionality from before, but now it has SharedCounter's logic for allowing multiple people to simultaneously increment. And our counter still triggers automatic React re-renders when others update it.

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

