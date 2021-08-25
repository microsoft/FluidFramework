---
title: Connect to an Azure Fluid Relay service
menuPosition: 2
---

Azure Fluid Relay service is a cloud-hosted Fluid service. You can connect your Fluid application to an Azure Fluid Relay instance using the `FrsClient` in the `@fluid-experimental/frs-client` package. `FrsClient` handles the logic of connecting your [Fluid Container]({{< relref "containers.md" >}}) to the service while keeping the container object itself service-agnostic. You can use one instance of this client to manage multiple containers.
Relay instance using the `FrsClient` in the `@fluid-experimental/frs-client` package. `FrsClient` handles the logic of
connecting your [Fluid container][] to the service while keeping the container object itself service-agnostic. You can
use one instance of this client to manage multiple containers.

The sections below will explain how to use `AzureClient` in your own application.

{{< include file="_includes/frs-onboarding.html" safeHTML=true >}}

## Connecting to the service

To connect to an Azure Fluid Relay instance you first need to create an `AzureClient`. You must provide some configuration parameters including the the tenant ID, orderer and storage URLs, and a token provider to generate the JSON Web Token (JWT) that will be used to authorize the current user against the service. The `azure-client` package provides an `InsecureTokenProvider` that can be used for development purposes.

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

const client = new AzureClient(config);
```

Now that you have an instance of `AzureClient`, you can start using it to create or load Fluid containers!

### Token providers

The [AzureFunctionTokenProvider]({{< relref "https://github.com/microsoft/FluidFramework/blob/main/experimental/framework/frs-client/src/AzureFunctionTokenProvider.ts" >}}) is an implementation of `ITokenProvider` which ensures your tenant key secret is not exposed in your client-side bundle code. The `AzureFunctionTokenProvider` takes in your Azure Function URL appended by `/api/GetFrsToken` along with the current user object. Later on, it makes an axios `GET` request call to your Azure function by passing in the tenantID, documentId and userID/userName as optional parameters.

```javascript
const config = {
    tenantId: "myTenantId",
    tokenProvider: new AzureFunctionTokenProvider("myAzureFunctionUrl"+"/api/GetFrsToken", { userId:
    "UserId", userName: "Test User"}),
    orderer: "https://myOrdererUrl",
    storage: "https://myStorageUrl",
};

const client = new AzureClient(config);
```
The user object can also hold optional additional user details such as the gender, address, email, etc. For example:

```javascript
cont userDetails: ICustomUserDetails = {
  email: "xyz@outlook.com",
  address: "Redmond",
};

const config = {
    tenantId: "myTenantId",
    tokenProvider: new AzureFunctionTokenProvider("myAzureFunctionUrl"+"/api/GetFrsToken", { userId:
    "UserId", userName: "Test User", additionalDetails: userDetails}),
    orderer: "https://myOrdererUrl",
    storage: "https://myStorageUrl",
};
```
Your Azure Function will generate the token for the given user that is signed using the tenant's secret key and returned to the client without exposing the secret itself.

## Managing containers

The `AzureClient` API exposes `createContainer` and `getContainer` functions to create and get containers respectively. Both functions take in the below two properties:

* A *container config* that defines the ID of the container and an optional entry point for logging.
* A *container schema* that defines the container data model.

```javascript
const schema = {
    name: "my-container",
    initialObjects: {
        /* ... */
    },
    dynamicObjectTypes: [ /*...*/ ],
}
const azureClient = new AzureClient(config);
await azureClient.createContainer({ id: "_unique-id_" }, schema);
const { fluidContainer, containerServices } = await azureClient.getContainer({ id: "_unique-id_" }, schema);
```

The `id` being passed into the container config is a unique identifier to a container instance. Any client that wants to join the same collaborative session just needs to call `getContainer` with the same container `id`.

For the further information on how to start recording logs being emitted by Fluid, please see [Telemetry]({{< relref "telemetry.md" >}})

The container being fetched back will hold the `initialObjects` as defined in the container schema. See [Data modeling]({{< relref "data-modeling.md" >}}) to learn more about how to establish the schema and use the `FluidContainer` object.

## Getting audience details

Calls to `createContainer` and `getContainer` return an `AzureResources` object that contains a `FluidContainer` -- described above -- and a `containerServices` object.

The `FluidContainer` contains the Fluid data model and is service-agnostic. Any code you write against this container object returned by the `AzureClient` is reusable with the client for another service. An example of this is if you prototyped your scenario using `TinyliciousClient`, then all of your code interacting with the Fluid shared objects within the container can be reused when moving to using `AzureClient`.

The `containerServices` object contains data that is specific to the Azure Fluid Relay service. This object contains an `audience` value that can be used to manage the roster of users that are currently connected to the container.

Let's take a look at how you can use the `audience` object to maintain an updated view of all the members currently in a container.

``` javascript
const { audience } = containerServices;
const audienceDiv = document.createElement("div");

const onAudienceChanged = () => {
        const members = audience.getMembers();
        const self = audience.getMyself();
        const memberStrings: string[] = [];
        const useAzure = process.env.FLUID_CLIENT === "azure";

        members.forEach((member: AzureMember<ICustomUserDetails>) => {
            if (member.userId !== self?.userId) {
                if (useAzure) {
                    const memberString = `${member.userName}: {Email: ${member.additionalDetails?.email},
                        Address: ${member.additionalDetails?.address}}`;
                    memberStrings.push(memberString);
                } else {
                    memberStrings.push(member.userName);
                }
            }
        });
        audienceDiv.innerHTML = `
            Current User: ${self?.userName} <br />
            Other Users: ${memberStrings.join(", ")}
        `;
    };

    onAudienceChanged();
    audience.on("membersChanged", onAudienceChanged);
```

`audience` provides two functions that will return `AzureMember` objects that have a user ID and user name:

* `getMembers` returns a map of all the users connected to the container. These values will change anytime a member joins or leaves the container.
* `getMyself` returns the current user on this client.

`audience` also emits events for when the roster of members changes. `membersChanged` will fire for any roster changes, whereas `memberAdded` and `memberRemoved` will fire for their respective changes with the `clientId` and `member` values that have been modified. After any of these events fire, a new call to `getMembers` will return the updated member roster.

A sample `AzureMember` object looks like the following:

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
  ],
  "additionalDetails": {
      "email": "xyz@outlook.com",
      "address": "Redmond",
  }
}
```

Alongside the user ID, name and addiitonal details, `AzureMember` objects also hold an array of `connections`. If the user is logged into the session with only one client, `connections` will only have one value in it with the ID of the client and if is in read/write mode. However, if the same user is logged in from multiple clients (i.e. they are logged in from different devices or have multiple browser tabs open with the same container), `connections` here will hold multiple values for each client. In the example data above, we can see that a user with name "Test User" and ID "0e662aca-9d7d-4ff0-8faf-9f8672b70f15" currently has the container open from two different clients. The values in the `additionalDetails` field match up to the values provided in the `AzureFunctionTokenProvider` token generation.

These functions and events can be combined to present a real-time view of the users in the current session.

**Congratulations!** You have now successfully connected your Fluid container to the Azure Fluid Relay service and
fetched back user details for the members in your collaborative session!

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Classes and interfaces -->

[ContainerRuntimeFactoryWithDefaultDataStore]: {{< relref "apis/aqueduct/containerruntimefactorywithdefaultdatastore.md" >}}
[DataObject]: {{< relref "apis/aqueduct/dataobject.md" >}}
[DataObjectFactory]: {{< relref "apis/aqueduct/dataobjectfactory.md" >}}
[Ink]: {{< relref "data-structures/ink.md" >}}
[PureDataObject]: {{< relref "apis/aqueduct/puredataobject.md" >}}
[PureDataObjectFactory]: {{< relref "apis/aqueduct/puredataobjectfactory.md" >}}
[SharedCell]: {{< relref "data-structures/cell.md" >}}
[SharedCounter]: {{< relref "data-structures/counter.md" >}}
[SharedDirectory]: {{< relref "data-structures/directory.md" >}}
[SharedMap]: {{< relref "data-structures/map.md" >}}
[SharedMatrix]: {{< relref "data-structures/matrix.md" >}}
[SharedNumberSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedObjectSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedSequence]: {{< relref "data-structures/sequences.md" >}}
[SharedString]: {{< relref "data-structures/string.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
