---
title: Testing and automation
menuPosition: 3
---

## Overview

Testing and automation are crucial to maintaining the quality and longevity of your code.  Internally, Fluid has a range of unit and integration tests powered by Mocha, Jest, and webpack.  Tests that need to run against a service are backed by [Tinylicious]({{< relref tinylicious.md >}}) or a test tenant of a [live service]({{< relref service-options.md >}}) such as [Azure Fluid Relay]({{< relref azure-frs.md >}}).

This document will explain how to use these tools to get started with writing automation for Fluid applications against a service.  It will focus on interactions with the service rather than automation in general, and will not cover the automation tools themselves or scenarios that do not require a service.

{{% callout important %}}

Specific examples of third-party libraries are used throughout this document for certain tasks.  While these are the same libraries used internally by Fluid, you are free to accomplish these tasks in other ways.  Microsoft is not responsible for [liability statement?].

{{% /callout %}}

## Automation against Tinylicious

Automation against Tinylicious is useful for scenarios such as merge validation which want to be unaffected by service interruptions.  Your automation should be responsible for starting a local instance of Tinylicious along with terminating it once tests have completed.  One way you can do this is by using the `start-server-and-test` package in the following npm scripts.

```json
"scripts": {
    ...
    "start:tinylicious": "tinylicious > tinylicious.log 2>&1",
    "test:mocha": "mocha",
    "test:tinylicious": "start-server-and-test start:tinylicious 7070 test:mocha",
    ...
}
```

Running the `test:tinylicious` script will start Tinylicious, wait until port 7070 responds (the default port on which Tinylicious runs), run the test script, and then terminate Tinylicious.  Your tests can then use `TinyliciousClient` as usual (see [Tinylicious]({{< relref tinylicious.md >}})).

## Automation against Azure Fluid Relay

With a test tenant for Azure Fluid Relay, your automation can connect to it in the same way as your production tenant and needs only provide the appropriate connection configuration.  See [Connect to an Azure Fluid Relay service]({{< relref azure-frs.md >}}) for more details.

### Azure Fluid Relay as an abstraction for Tinylicious

The Azure Fluid Relay client can also connect to a local Tinylicious instance.  This allows you to use a single client type between tests against live and local service instances, where the only difference is the configuration used to create the client.

```javascript
const user = {
    id: "UserId",
    name: "Test User",
};
const config = {
    tenantId: "local",
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
// This FrsClient instance connects to a local Tinylicious
// instance rather than a live Azure Fluid Relay service
const client = new FrsClient(config);
```

These values for `tenantId`, `orderer`, and `storage` correspond to those for Tinylicious, where `7070` is the default port for Tinylicious.
