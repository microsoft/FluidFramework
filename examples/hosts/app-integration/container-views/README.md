# @fluid-example/app-integration-container-views

**Dice Roller** is a basic example that has a die and a button. Clicking the button re-rolls the die and persists the value in the root SharedDirectory.

This implementation demonstrates plugging the container into a standalone application, rather than using the webpack-fluid-loader environment that most of our packages use.  This implementation relies on [Tinylicious](/server/tinylicious), so there are a few extra steps to get started.  We expect the container to respond with a mountable view that we can use for rendering.

## Getting Started

If you want to run this example do the following steps:

### Start Tinylicious

Go to [/server/tinylicious](/server/tinylicious) and follow the instructions there to start the Tinylicious server.

### Start the app server

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

## Data model

Dice Roller uses the following distributed data structures:

- SharedDirectory - root
