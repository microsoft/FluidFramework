# @fluid-example/likes-and-comments

**Like and Comments** is a Fluid Component that displays how to use a combination of Fluid DDS hooks and local React hooks together.
It uses a SharedString, SharedCounter, and a SharedObjectSequence as part of its synced state. This shows how multiple DDS' can be accessed using the respective synced hooks, useSyncedString, useSyncedCounter, and useSyncedArray, and used to power React views without using any handles or event listeners.

## Getting Started

To run this follow the steps below:

1. Run `npm install` from the Likes and Comments root
2. Start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious)
3. Run `npm run start` (from a different command window) to start the example

## Available Scripts

### `build`

```bash
npm run build
```

Runs [`tsc`](###-tsc) and [`webpack`](###-webpack) and outputs the results in `./dist`.

### `start`

```bash
npm run start
```

Uses `webpack-dev-server` to start a local webserver that will host your webpack file.

Once you run `start` you can navigate to `http://localhost:8080` in any browser window to use your fluid example.

> The Tinylicious Fluid server must be running. See `start:server` below.

### `start:server`

```bash
npm run start:server
```

Starts an instance of the Tinylicious Fluid server running locally at `http://localhost:3000`.

> Tinylicious only needs to be running once on a machine and can support multiple examples.

### `start:test`

```bash
npm run start:test
```

Uses `webpack-dev-server` to start a local webserver that will host your webpack file.

Once you run `start:test` you can navigate to `http://localhost:8080` in any browser window to test your fluid example.

`start:test` uses a Fluid server with storage to local tab session storage and launches two instances side by side. It does not require Tinylicious.

This is primarily used for testing scenarios.

### `test`

```bash
npm run test
```

Runs end to end test using [Jest](https://jestjs.io/) and [Puppeteer](https://github.com/puppeteer/puppeteer/).

### `test:report`

```bash
npm run test:report
```

Runs `npm run test` with additional properties that will report success/failure to a file in `./nyc/*`. This is used for CI validation.

### `tsc`

Compiles the TypeScript code. Output is written to the `./dist` folder.

### `webpack`

Compiles and webpacks the TypeScript code. Output is written to the `./dist` folder.

## Known Issues

### [Issue #22](https://github.com/microsoft/FluidExamples/issues/22) - Presence stored in the ShareMap

### [Issue #23](https://github.com/microsoft/FluidExamples/issues/23) - No Undo/Redo Support

### [Issue #24](https://github.com/microsoft/FluidExamples/issues/24) - No FluidObject Canvas Support
