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

## Backed Locally and running with live FRS instance

We can connect to both live FRS instance by passing in the tenant ID, orderer and storage as well as using the tenant ID as "local" for running against Tinylicious for development purpose.

To run the the `FrsClient` against our local Tinylicious instance, we pass the `tenantId` as "local" and make use of `InsecureTokenProvider`. For the latter, we pass in two values to its constructor: a key string, which can be anything since we are running it locally, and an object identifying the current user. For running the instance locally, the orderer and storage URLs would point to the Tinylicious instance on the default values of `http://localhost:7070`.

"To launch the local Tinylicious service instance, run `npx tinylicious` from your terminal window"

When running the live FRS Instance, we would require the tenant ID, orderer and storage URLs. We make use of `FrsAzFunctionTokenProvider` which takes in the Azure function URL and an object identifying the current user, thereby making an axios `GET` request call to the Azure Function. This axios call takes in the tenant ID, documentId and userID/userName as optional parameters. The Azure Function is responsible for mapping the tenantId to tenant key secret to generate and sign the token such that the service will accept it.

```typescript
const connectionConfig: FrsConnectionConfig = useFrs ? {
    tenantId: "YOUR-TENANT-ID-HERE",
    tokenProvider: new FrsAzFunctionTokenProvider("AZURE-FUNCTION-URL"+"/api/GetFrsToken", { userId: "test-user", userName: "Test User" }),
    orderer: "ENTER-ORDERER-URL-HERE",
    storage: "ENTER-STORAGE-URL-HERE",
} : {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
```
In this way, we can toggle between remote and local mode using the same config format. We make use of `FrsAzFunctionTokenProvider` for running against live FRS instance since it is more secured, without exposing the tenant secret key in the client-side code whereas while running the service locally for development purpose, we make use of `InsecureTokenProvider`.
