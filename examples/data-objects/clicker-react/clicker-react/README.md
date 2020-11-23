# @fluid-example/clicker-react

**Clicker-React** is a Fluid object that displays a number with a button. Pressing the button
increments the counter. This is a basic example built using the new FluidReactView class.

**Clicker-React** demonstrates how you can prepare the configuration for the Fluid object for the React view to enjoy state updates from Fluid DDSes like SharedCounter without event listeners.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- The getting started instructions are automatically generated.
To update them, edit md-magic.config.js in the root of the repo, then run npm run readme:update -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/clicker-react`
1. Navigate to this directory (examples/data-objects/clicker-react/clicker-react).
1. Run `npm run start`.
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
