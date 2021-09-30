---
title: Testing and automation
menuPosition: 3
---

## Overview

Testing and automation are crucial to maintaining the quality and longevity of your code.  Internally, Fluid has a range of unit and integration tests powered by [Mocha](https://mochajs.org/), [Jest](https://jestjs.io/), [Puppeteer](https://github.com/puppeteer/puppeteer), and [webpack](https://webpack.js.org/).  Tests that need to run against a service are backed by [Tinylicious]({{< relref "tinylicious.md" >}}) or a test tenant of a [live service]({{< relref "service-options.md" >}}) such as [Azure Fluid Relay service]({{< relref "azure-frs.md" >}}).

This document will explain how to use these tools to get started with writing automation for Fluid applications against a service.  It will focus on interactions with the service rather than automation in general, and will not cover the automation tools themselves or scenarios that do not require a service.

## Automation against Tinylicious

Automation against Tinylicious is useful for scenarios such as merge validation which want to be unaffected by service interruptions.  Your automation should be responsible for starting a local instance of Tinylicious along with terminating it once tests have completed.  This example uses the [start-server-and-test package](https://github.com/bahmutov/start-server-and-test) to do this.  You can substitute other libraries or implementations.

First install the packages or add them to your dependencies then install:

```bash
npm install tinylicious start-server-and-test mocha
```

Once installed, you can use the following npm scripts:

```json
"scripts": {
    ...
    "start:tinylicious": "tinylicious > tinylicious.log 2>&1",
    "test:mocha": "mocha",
    "test:tinylicious": "start-server-and-test start:tinylicious 7070 test:mocha",
    ...
}
```

The `test:tinylicious` script will start Tinylicious, wait until port 7070 responds (the default port on which Tinylicious runs), run the test script, and then terminate Tinylicious.  Your tests can then use `TinyliciousClient` as usual (see [Tinylicious]({{< relref "tinylicious.md" >}})).

## Automation against Azure Fluid Relay

Your automation can connect to a test tenant for Azure Fluid Relay in the same way as your production tenant and only needs the appropriate connection configuration. See [Connect to an Azure Fluid Relay service]({{< relref "azure-frs.md" >}}) for more details.

### Azure Fluid Relay as an abstraction for Tinylicious

The Azure Fluid Relay client can also connect to a local Tinylicious instance.  This allows you to use a single client type between tests against live and local service instances, where the only difference is the configuration used to create the client.

```javascript
const user = {
    id: "UserId",
    name: "Test User",
};
const config = {
    tenantId: LOCAL_MODE_TENANT_ID,
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
// This AzureClient instance connects to a local Tinylicious
// instance rather than a live Azure Fluid Relay service
const client = new AzureClient(config);
```

These values for `tenantId`, `orderer`, and `storage` correspond to those for Tinylicious, where `7070` is the default port for Tinylicious. `LOCAL_MODE_TENANT_ID` is imported from `@fluidframework/azure-client`.

## Automation example

This example combines the concepts from this document to show how you can write one test suite that runs against both Tinylicious or Azure Fluid Relay.

First you need to create a client that can adapt to the test scenario.  This example uses an environment variable to determine which service to target and for the tenant key.  The target service variable can be set as part of the test script, while secrets can be set by individual users or provided by your CI pipeline.

```typescript
function createAzureClient(): AzureClient {
    const useAzure = process.env.FLUID_CLIENT === "azure";
    const tenantKey = useAzure ? process.env.FLUID_TENANTKEY as string : "";
    const user = { id: "userId", name: "Test User" };

    const connectionConfig = useAzure ? {
        tenantId: "myTenantId",
        tokenProvider: new InsecureTokenProvider(tenantKey, user),
        orderer: "https://myOrdererUrl",
        storage: "https://myStorageUrl",
    } : {
        tenantId: LOCAL_MODE_TENANT_ID,
        tokenProvider: new InsecureTokenProvider("fooBar", user),
        orderer: "http://localhost:7070",
        storage: "http://localhost:7070",
    };
    return new AzureClient(connectionConfig);
}
```

Your test can then call this function to create a client object without concerning itself about the underlying service.  This [mocha](https://mochajs.org/) test example creates the service client before running any tests, and uses the [uuid](https://github.com/uuidjs/uuid) package to generate a random `documentId` for each test.  You can substitute other libraries or implementations.  There is a single test that uses the service client to create a container which passes as long as no errors are thrown.

```typescript
import { v4 as uuid } from "uuid";

...

describe("ClientTest", () => {
    const client = createAzureClient();
    let documentId: string;
    beforeEach(() => {
        documentId = uuid();
    });

    it("can create Azure container successfully", async () => {
        const schema: ContainerSchema = {
            initialObjects: {
              customMap: SharedMap
            },
        };

        const containerAndServices  = await client.createContainer(schema);
    });
});

```

You can then use the following npm scripts:

```json
"scripts": {
    ...
    "start:tinylicious": "tinylicious > tinylicious.log 2>&1",
    "test:mocha": "mocha",
    "test:azure": "cross-env process.env.FLUID_CLIENT='\"azure\"' && npm run test:mocha",
    "test:tinylicious": "start-server-and-test start:tinylicious 7070 test:mocha",
    ...
}
```
