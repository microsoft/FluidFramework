# @fluid-example/app-integration-schema-upgrade

This demo explores importing data from an external source to initialize the container's data with, and then exporting the container's current data back out to that format on demand.  Note that this demo is not final and has functionality gaps, do not take its current state as a best practice to replicate.

In this implementation, the *app* has the knowledge of the external data and its format.  It reads in and parses the data, and does the work to translate that into operations upon the data object.  The data object itself is unaware that the source of the data is external.  Similarly, the app does the work to iterate through the data object's contents and serialize that back out to the external format.

An alternate implementation might choose to include the external format support in the *data object*, in which case the data object might have public `import()` and `export()` methods for the app to call.  This might be nice for keeping the persisted data format "close" to the data object to ensure import/export remains supported, but offers less flexibility in choosing the persisted data format.

For demo purposes, this example reads and writes from a string, displaying it in the view.  However, this approach would be equally valid using database read/writes, REST calls, etc.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- The getting started instructions are automatically generated.
To update them, edit docs/md-magic.config.js, then run 'npm run build:md-magic' -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-schema-upgrade`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/hosts/app-integration/schema-upgrade) and open <http://localhost:8080> in a web browser to see the app running.
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
