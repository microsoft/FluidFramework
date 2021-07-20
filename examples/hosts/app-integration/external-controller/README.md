# @fluid-example/app-integration-external-controller

**_This demo is a work-in-progress_**

**Dice Roller** is a basic example that has a die and a button. Clicking the button re-rolls the die and persists the value in the root SharedDirectory. The Fluid Container is defined in container/, the data object is defined in dataObject/.

This implementation demonstrates plugging that Container into a standalone application, rather than using the webpack-fluid-loader environment that most of our packages use.  This implementation relies on [Tinylicious](/server/tinylicious), so there are a few extra steps to get started.  We bring our own view that we will bind to the data in the container.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED:tinylicious=true) -->
<!-- The getting started instructions are automatically generated.
To update them, edit md-magic.config.js in the root of the repo, then run npm run readme:update -->

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/app-integration-external-controller`
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run `npm run start` from this directory (examples/hosts/app-integration/external-controller) and open <http://localhost:8080> in a web browser to see the app running.
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

## Data model

Dice Roller uses the following distributed data structures:

- SharedDirectory - root

### Backed Locally and running with live FRS instance

When running the live FRS Instance, we would require the tenant ID, orderer and storage URLs. Each tenant ID maps to a tenant key secret that can be passed to the `FrsAzFunctionTokenProvider` to generate and sign the token such that the service will accept it. For running the instance locally, it would get naviagted to the Tinylicious on the default values of `localhost:7070`.

```typescript
const connectionConfig: FrsConnectionConfig = useFrs ? {
    tenantId: "",
    tokenProvider: new FrsAzFunctionTokenProvider("", frsAzUser),
    orderer: "",
    storage: "",
} : {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
```
In this way, we can toggle between remote and local mode using the same config format.
