---
title: Connect to an Azure Fluid Relay service
menuPosition: 2
---

# Introduction

Azure Fluid Relay service (FRS) is a cloud-hosted Fluid service. You can connect your Fluid application to an Azure Fluid Relay instance using the `FrsClient` in the `@fluid-experimental/frs-client` package. `FrsClient` handles the logic of connecting your [Fluid Container]({{< relref "containers.md" >}}) to the service while keeping the container object itself service-agnostic. You can use one instance of this client to manage multiple containers.

The sections below will explain how to use `FrsClient` in your own application.

{{< include file="_includes/frs-onboarding.html" safeHTML=true >}}

# Connecting to the Service

To connect to an Azure Fluid Relay instance you first need to create an `FrsClient`. You must provide some configuration parameters including the the tenant ID, orderer and storage URLs, and a token provider to generate the JSON Web Token (JWT) that will be used to authorize the current user against the service. The `frs-client` package provides an `InsecureTokenProvider` that can be used for development purposes.

{{< callout danger >}}
The `InsecureTokenProvider` should only be used for development purposes because **using it exposes the tenant key secret in your client-side code bundle.** This must be replaced with an implementation of `ITokenProvider` that fetches the token from your own backend service that is responsible for signing it with the tenant key.
{{< /callout >}}


```javascript
const config = {
    tenantId: "myTenantId",
    tokenProvider: new InsecureTokenProvider("myTenantKey", { id: "UserId", name: "Test User" }),
    orderer: "https://myOrdererUrl",
    storage: "https://myStorageUrl",
}

const client = new FrsClient(config);
```

Now that you have an instance of `FrsClient`, you can start using it to create or load Fluid containers!

## Token providers

Coming soon!

# Managing containers

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

For the further information on how to start recording logs being emitted by Fluid, please see [Telemetry]({{< relref "telemetry.md" >}})

The container being fetched back will hold the `initialObjects` as defined in the container schema. See [Data modeling]({{< relref "data-modeling.md" >}}) to learn more about how to establish the schema and use the `FluidContainer` object.

# Getting Audience Details

Calls to `createContainer` and `getContainer` return an `FrsResources` object that contains a `FluidContainer` -- described above -- and a `containerServices` object.

The `FluidContainer` contains the Fluid data model and is service-agnostic. Any code you write against this container object returned by the `FrsClient` is reusable with the client for another service. An example of this is if you prototyped your scenario using `TinyliciousClient`, then all of your code interacting with the Fluid shared objects within the container can be reused when moving to using `FrsClient`.

The `containerServices` object contains data that is specific to the Azure Fluid Relay service. This object contains an `audience` value that can be used to manage the roster of users that are currently connected to the container.

Let's take a look at how you can use the `audience` object to maintain an updated view of all the members currently in a container.

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

`audience` provides two functions that will return `FrsMember` objects that have a user ID and user name:
- `getMembers` returns a map of all the users connected to the container. These values will change anytime a member joins or leaves the container.
- `getMyself` returns the current user on this client.

`audience` also emits events for when the roster of members changes. `membersChanged` will fire for any roster changes, whereas `memberAdded` and `memberRemoved` will fire for their respective changes with the `clientId` and `member` values that have been modified. After any of these events fire, a new call to `getMembers` will return the updated member roster.

A sample `FrsMember` object looks like the following:

```json
{
  "userId": "0e662aca-9d7d-4ff0-8faf-9f8672b70f15",
  "userName": "Test User",
  "connections": [
    {
      "id": "c699c3d1-a4a0-4e9e-aeb4-b33b00544a71",
      "mode": "write"
    },
    {
      "id": "0e662aca-9d7d-4ff0-8faf-9f8672b70f15",
      "mode": "write"
    }
  ]
}
```

Alongside the user ID and name, `FrsMember` objects also hold an array of `connections`. If the user is logged into the session with only one client, `connections` will only have one value in it with the ID of the client and if is in read/write mode. However, if the same user is logged in from multiple clients (i.e. they are logged in from different devices or have multiple browser tabs open with the same container), `connections` here will hold multiple values for each client. In the example data above, we can see that a user with name "Test User" and ID "0e662aca-9d7d-4ff0-8faf-9f8672b70f15" currently has the container open from two different clients.

These functions and events can be combined to present a real-time view of the users in the current session.

**Congratulations!** You have now succesfully connected your Fluid container to the FRS service and fetched back user details for the members in your collaborative session!!
