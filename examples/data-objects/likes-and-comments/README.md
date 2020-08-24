# @fluid-example/likes-and-comments

**Like and Comments** is a Fluid Component that displays how to use a combination of Fluid DDS hooks and local React hooks together.
It uses a SharedString, SharedCounter, and a SharedObjectSequence as part of its synced state. This shows how multiple DDS' can be accessed using the respective synced hooks, useSyncedString, useSyncedCounter, and useSyncedArray, and used to power React views without using any handles or event listeners.

## Getting Started

If you want to run this example follow the following steps:

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
