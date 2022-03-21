# @fluid-example/corruption-recovery

This example explores recovery of corrupted container by an arbitrary client. Only one of the connected clients should complete recovery process and return new container generated out of some earlier version of the corrupted container. The remaining connected clients should be able to observe recovery process and land to the same state as the client who initiated and completed recovery.

Note: In the current state, this example app is not functional. New Azure Client API supporting recovery process still needs to be added. The purpose of sending this example early is to get feedback around client synchronization during recovery, and show an example code on how recovery process could be completed.

## Getting Started

You can run this example using the following steps:

1. Run `npm install` and `npm run build:fast -- --nolint` from the `FluidFramework` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      `npm run build:fast -- --nolint @fluid-example/corruption-recovery`
2. This example runs against Azure Fluid Relay. Make sure you have your `connectionConfig` params set.
3. Run `npm run start` from this directory (examples/hosts/app-integration/corruption-recovery) and open <http://localhost:8080> in a web browser to see the app running.

## Backed Locally and running with live Azure Fluid Relay service instance

We can connect to a live Azure Fluid Relay instance by passing in the tenant ID, orderer, and storage, or we can connect to a local Tinylicious server for development purposes by passing in "local" for the tenant ID.

To run the the `AzureClient` against our local Tinylicious instance, we pass the `tenantId` as "local" and make use of
`InsecureTokenProvider`. For the latter, we pass in two values to its constructor: a key string, which can be anything
since we are running it locally, and an object identifying the current user. For running the instance locally,
the orderer and storage URLs would point to the Tinylicious instance on the default values of `http://localhost:7070`.

To launch the local Tinylicious service instance, run `npx tinylicious` from your terminal window.

When running the live Azure Fluid Relay Instance, we would require the tenant ID, orderer and storage URLs. We make use of
`AzureFunctionTokenProvider` which takes in the Azure function URL and an object identifying the current user, thereby
making an axios `GET` request call to the Azure Function. This axios call takes in the tenant ID, documentId and
userID/userName as optional parameters. The Azure Function is responsible for mapping the tenantId to tenant key secret
to generate and sign the token such that the service will accept it.

```typescript
const connectionConfig: AzureConnectionConfig = useAzure ? {
    tenantId: "YOUR-TENANT-ID-HERE",
    tokenProvider: new AzureFunctionTokenProvider("AZURE-FUNCTION-URL"+"/api/GetAzureToken", { userId: "test-user", userName: "Test User" }),
    orderer: "ENTER-ORDERER-URL-HERE",
    storage: "ENTER-STORAGE-URL-HERE",
} : {
    tenantId: LOCAL_MODE_TENANT_ID,
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
```

In this way, we can toggle between remote and local mode using the same config format. We make use of
`AzureFunctionTokenProvider` for running against live Azure Fluid Relay instance since it is more secured, without exposing the tenant
secret key in the client-side code whereas while running the service locally for development purpose, we make use of `InsecureTokenProvider`.

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
