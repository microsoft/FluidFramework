---
title: Connect to a Fluid Service in Azure with FrsClient
menuPosition: 2
---

# Introduction

Azure Fluid Relay service (FRS) is a cloud-hosted Fluid service. You can connect your Fluid application to an Azure Fluid Relay instance using the `FrsClient` in the `@fluid-experimental/frs-client` package. `FrsClient` handles the logic of connecting your [Fluid Container]({{< relref "containers.md" >}}) to the service while keeping the container object itself service-agnostic. You can use one instance of this client to manage multiple containers.

Let's take a look at how to go about using the `frs-client` in your app!

# Connecting to the Service

To connect to our FRS instance, we first need to instaniate our `FrsClient`. This takes in, as configuration parameters, the tenant ID, orderer, and storage URLs that were provided as part of the FRS onboarding process. It also requires a token provider to generate the JWT token that will be used to authorize the current user against the service. The `InsecureTokenProvider` should only be used for testing purposes as it exposes the tenant key secret in your client-side code bundle. This should be replaced with an implementation of `ITokenProvider` that fetches the token from your own backend service that is responsible for signing it with the tenant key. 

```typescript
const config: FrsConnectionConfig = {
    tenantId: "myFrsTenantId",
    // IMPORTANT: this token provider is suitable for testing ONLY. It is NOT secure.
    tokenProvider: new InsecureTokenProvider("myFrsTenantKey", { id: "UserId", name: "Test User" }),
    orderer: "https://myFrsOrdererUrl",
    storage: "https://myFrsStorageUrl",
}

const client = new FrsClient(config);
```

Now that we have an instance of our client, we can start using it to create new or load existing Fluid containers!

# Managing Containers

The `FrsClient` provides two functions on its API to create and get containers respectively. They both take in two parameters:
- A container config that defines the ID of the container and an optional entrypoint for logging
- A container schema that defines the DDSes and data objects that this container will hold

```typescript
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

The ID that is being passed in to the container config can be thought of as the "filename" for the item holding the data for this container on the FRS backend. Any client that wants to join the same collaborative session just needs to call `getContainer` with the same container ID.

For the further information on how to start recording logs being emitted by Fluid, please see [Telemetry](../testing/telemetry.md)

The container being fetched back will hold the `initialObjects` as defined in the container schema. Please read [Data modeling](../build/data-modeling.md) to see how to establish the schema and use the `fluidContainer` object.

# Getting Audience Details

Both calls to `createContainer` and `getContainer` return an `FrsResources` object that holds the Fluid container that we were discussing above as well as a `containerServices` object. Whereas the container itself will always stay the same regardless of which service it is being connected, the `containerServices` hold values that are specific to the FRS service. Within this object, we will find an `audience` value that can be used to manage the roster of users that are currently collaborating in the container.

`audience` provides two callbacks that will return `FrsMember` objects that have a user ID and user name:
- `getMembers` returns a map of all the users that are currently in the Fluid session
- `getMyself` returns the current user on this client

Alongside the user ID and name, `FrsMember` objects also hold an array of `connections`. If the user is logged into the session with only one client, `connections` will only have one value in it with the ID of the client and if is in read/write mode. However, if the same user is logged in from multiple clients, `connections` here will hold multiple values for each client.

`audience` also emits events for when the roster of members changes. `membersChanged` will fire for any roster changes, whereas `memberAdded` and `memberRemoved` will fire for their respective changes with the `clientId` and `member` values that have been modified.

These callbacks and events can be combined to keep an updated view that represents the members in the current session.

``` typescript
const { audience } = containerServices;
const audienceDiv = document.createElement("div");

const onAudienceChanged = () => {
    const members = audience.getMembers();
    const self = audience.getMyself();
    const memberNames: string[] = [];
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

Every time the `membersChanged` events gets fired, we fetch the new member roster and update the view accordingly.

**Congratulations!** You have now succesfully connected your Fluid container to the FRS service and fetched back user details for the members in your collaborative session!!
