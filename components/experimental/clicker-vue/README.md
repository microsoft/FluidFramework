# @fluid-example/clicker-vue

**Clicker** is a Fluid Component that displays a number with a button. Pressing the button
increments the counter. This is a basic example component using the interface model and stock
classes.

**Clicker-Vue** as a view component that uses the provided renderVue function from **@fluidframework/vue**

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
