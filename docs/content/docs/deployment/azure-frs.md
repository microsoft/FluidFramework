---
title: Connect to an Azure Fluid Relay service
menuPosition: 2
---

# Introduction

Azure Fluid Relay service (FRS) is a cloud-hosted Fluid service. You can connect your Fluid application to an Azure Fluid Relay instance using the `FrsClient` in the `@fluid-experimental/frs-client` package. `FrsClient` handles the logic of connecting your [Fluid Container]({{< relref "containers.md" >}}) to the service while keeping the container object itself service-agnostic. You can use one instance of this client to manage multiple containers.

The sections below will explain how to use `FrsClient` in your own application.

{{< callout important >}}
The steps below assume you are onboarded to Azure Fluid Relay service. Azure Fluid Relay is currently in _Private Preview_.
{{< /callout >}}

# Connecting to the Service

To connect to our FRS instance, we first need to instaniate our `FrsClient`. This takes in, as configuration parameters, the tenant ID, orderer, and storage URLs that were provided as part of the FRS onboarding process. It also requires a token provider to generate the JWT token that will be used to authorize the current user against the service. The `InsecureTokenProvider` should only be used for testing purposes as it exposes the tenant key secret in your client-side code bundle. This should be replaced with an implementation of `ITokenProvider` that fetches the token from your own backend service that is responsible for signing it with the tenant key. 

```javascript
const config = {
    tenantId: "myFrsTenantId",
    tokenProvider: new InsecureTokenProvider("myFrsTenantKey", { id: "UserId", name: "Test User" }),
    orderer: "https://myFrsOrdererUrl",
    storage: "https://myFrsStorageUrl",
}

const client = new FrsClient(config);
```

Now that you have an instance of `FrsClient`, you can start using it to create or load Fluid containers!

# Managing containers

##  Token Providers

The `FrsClient` API exposes `createContainer` and `getContainer` functions to create and get containers respectively. Both functions take in the below two properties:

- A _container config_ that defines the ID of the container and an optional entry point for logging.
- A _container schema_ that defines the container data model.

```javascript
const schema = {
    name: "my-container",
    initialObjects: {
        /* ... */
    },
    dynamicObjectTypes: [ /*...*/ ],
}
const frsClient = new FrsClient(config);
await frsClient.createContainer({ id: "_unique-id_" }, schema);
const { fluidContainer, containerServices } = await frsClient.getContainer({ id: "_unique-id_" }, schema);
```

The `id` being passed into the container config is a unique identifier to a container instance. Any client that wants to join the same collaborative session just needs to call `getContainer` with the same container `id`.

For the further information on how to start recording logs being emitted by Fluid, please see [Telemetry](../testing/telemetry.md)

The container being fetched back will hold the `initialObjects` as defined in the container schema. See [Data modeling](../build/data-modeling.md) to learn more about how to establish the schema and use the `FluidContainer` object.

# Getting Audience Details

Calls to `createContainer` and `getContainer` return an `FrsResources` object that contains a `FluidContainer` -- described above -- and a `containerServices` object.

The `FluidContainer` contains the Fluid data model and is service-agnostic. Any code you write against this container object returned by the `FrsClient` is reusable with the client for another service. An example of this is if you prototyped your scenario using `TinyliciousClient`, then all of your code interacting with the Fluid DDSes and data objects within the container can be reused when moving to using `FrsClient`.

The `containerServices` object contains data that is specific to the Azure Fluid Relay service. This object contains an `audience` value that can be used to manage the roster of users that are currently connected to the container.

`audience` provides two callbacks that will return `FrsMember` objects that have a user ID and user name:
- `getMembers` returns a map of all the users connected to the container.
- `getMyself` returns the current user on this client.

Alongside the user ID and name, `FrsMember` objects also hold an array of `connections`. If the user is logged into the session with only one client, `connections` will only have one value in it with the ID of the client and if is in read/write mode. However, if the same user is logged in from multiple clients, `connections` here will hold multiple values for each client.

`audience` also emits events for when the roster of members changes. `membersChanged` will fire for any roster changes, whereas `memberAdded` and `memberRemoved` will fire for their respective changes with the `clientId` and `member` values that have been modified.

These callbacks and events can be combined to present a real-time view of the users in the current session.

``` javascript
const { audience } = containerServices;
const audienceDiv = document.createElement("div");

const onAudienceChanged = () => {
    const members = audience.getMembers();
    const self = audience.getMyself();
    const memberNames = [];
    members.forEach((member) => {
        if (member.userId !== self?.userId) {
            memberNames.push(member.userName);
        }
    });
    audienceDiv.innerHTML = `
        Current User: ${self?.userName} <br />
        Other Users: ${memberNames.join(", ")}
    `;
};

onAudienceChanged();
audience.on("membersChanged", onAudienceChanged);
```

Every time the `membersChanged` event is sent, the new member roster is fetched and the view is updated accordingly.

**Congratulations!** You have now succesfully connected your Fluid container to the FRS service and fetched back user details for the members in your collaborative session!!
