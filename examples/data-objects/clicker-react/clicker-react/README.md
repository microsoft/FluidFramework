# @fluid-example/clicker-react

**Clicker-React** is a Fluid object that displays a number with a button. Pressing the button
increments the counter. This is a basic example built using the new FluidReactView class.

**Clicker-React** demonstrates how you can prepare the configuration for the Fluid object for the React view to enjoy state updates from Fluid DDSes like SharedCounter without event listeners.

## Getting Started

If you want to run this example follow the following steps:

1. Run `npm install` and `npm run build:fast` from the `FluidFramework` root directory
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
