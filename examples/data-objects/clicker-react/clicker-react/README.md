# @fluid-example/clicker-react

**Clicker-React** is a Fluid object that displays a number with a button. Pressing the button
increments the counter. This is a basic example built using the new FluidReactView class.

**Clicker-React** demonstrates how you can prepare the configuration for the Fluid object for the React view to enjoy state updates from Fluid DDSes like SharedCounter without event listeners.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- AUTO-GENERATED-CONTENT:END -->

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
