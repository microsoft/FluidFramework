# @fluidframework/clicker-reducer

**clicker-reducer** shows how Clicker could be written in a scalable manner by using the useReducerFluid hook. Here, we set up a reducer that allows the view to dispatch the action to increment the counter, rather than directly interact with it. This shows how Fluid components could scale with more complex data store requirements.

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
