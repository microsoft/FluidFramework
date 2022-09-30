---
title: User presence and audience
menuPosition: 5
editor: tylerbutler
---

The audience is the collection of users connected to a container.  When your app creates a container using a service-specific client library, the app is provided with a service-specific audience object for that container as well. Your code can query the audience object for connected users and use that information to build rich and collaborative user presence features.

This document will explain how to use the audience APIs and then provide examples on how to use the audience to show user presence.  For anything service-specific, the [Tinylicious]({{< relref "tinylicious.md" >}}) Fluid service is used.

## Working with the audience

When creating a container, your app is also provided a container services object which holds the audience.  This audience is backed by that same container. The following is an example. Note that `client` is an object of a type that is provided by a service-specific client library.

```js
const { container, services } =
    await client.createContainer(containerSchema);
const audience = services.audience;
```

### The IMember

Audience members exist as `IMember` objects:

```typescript
export interface IMember {
    userId: string;
    connections: IConnection[];
}
```

An `IMember` represents a single user identity.  `IMember` holds a list of `IConnection` objects, which represent that audience member's active connections to the container.  Typically a user will only have one connection, but scenarios such as loading the container in multiple web contexts or on multiple computers will also result in as many connections. An audience member will always have at least one connection. Each user and each connection will both have a unique identifier.

{{% callout tip %}}

Connections can be short-lived and are not reused. A client that disconnects from the container and immediately reconnects will receive an entirely new connection. The audience will reflect through its [member leaving and member joining events](#events).

{{% /callout %}}

### Service-specific audience data


The `ServiceAudience` class represents the base audience implementation, and individual Fluid services are expected to extend this class for their needs. Typically this is through extending `IMember` to provide richer user information and then extending `ServiceAudience` to use the `IMember` extension. For `TinyliciousAudience`, this is the only change, and it defines a `TinyliciousMember` to add a user name.

```typescript
export interface TinyliciousMember extends IMember {
    userName: string;
}
```

{{% callout tip %}}
Because audience data is service-specific, code that interacts with audience may be less portable to other services.
{{% /callout %}}

### APIs

#### getMembers

The `getMembers` method returns a map of the audience's current members. The map keys are user IDs (i.e. the `IMember.userId` property), and values are the `IMember` objects for the corresponding user IDs. Your code can further query the individual `IMember` objects for their client connections.

{{% callout tip "Tips" %}}

The map returned by `getMembers` represents a snapshot in time and will not update internally as members enter and leave the audience. Instead of holding onto the return value, your code should subscribe to `ServiceAudience`'s events for member changes.

{{% /callout %}}

#### getMyself

The `getMyself` method returns the `IMember` object from the audience corresponding to the current user calling the method. It does so by matching the container's current client connection ID with one from the audience.

{{% callout tip %}}

Connection transitions can result in short timing windows where `getMyself` returns `undefined`. This is because the current client connection will not have been added to the audience yet, so a matching connection ID cannot be found. Similarly, offline scenarios may produce the same behavior.

{{% /callout %}}

### Events

#### membersChanged

The `membersChanged` event is emitted whenever a change to the audience members' client connections is made and will always be paired with a `memberAdded` or `memberRemoved` event. Listeners may call the `getMembers` method to get the new list of members and their connections. Listeners that need the specific changed member or connection should use the `memberAdded` and `memberRemoved` events instead.

#### memberAdded

The `memberAdded` event is emitted whenever a client connection is added to the audience. The event also provides the connection client ID and the `IMember` object for this change. The `IMember` object may be queried for more information on the new connection using the provided connection client ID. Depending on if it already had previous connections, the `IMember` object may be either new or existing.

#### memberRemoved

The `memberRemoved` event is emitted whenever a client connection leaves the audience. The event also provides the connection client ID and the `IMember` object for this change. The `IMember` object reflects its state in the audience before the connection's removal, and may be queried for more information on the removed connection using the provided connection client ID.

## Using audience to build presence features

### Data management and inter-user communication

While the audience is the foundation for user presence features, the list of connected users does not provide a compelling experience on its own. Building compelling presence features will involve working with additional user data. These data typically fit into one or more of the categories below.

#### Shared persisted data

Most presence scenarios will involve data that only a single user or client knows and needs to communicate to other audience members. Some of those scenarios will require the app to save data for each user for future sessions. For example, consider a scenario where you want to display how long each user has spent in your application. An active user's time should increment while connected, pause when they disconnect, and resume once they reconnect. This means that the time each user has spent must be persisted so it can survive disconnections.

One option is to use a `SharedMap` object with a `SharedCounter` object as the value onto which each user will increment their time spent every minute (also see [Introducing distributed data structures]({{< relref dds.md >}})). All other connected users will then receive changes to that SharedMap automatically. Your app's UI can display data from the map for only users present in the audience. A returning user can find themselves in the map and resume from the latest state.

#### Shared transient data

Many presence scenarios involve data that are short-lived and do not need to be persisted. For example, consider a scenario where you want to display what each user has selected in the UI. Each user will need to tell other users their own information -- where they clicked -- but the past data are irrelevant.

You can address this scenario using DDSes in the same way as with the persisted data scenario. However, using DDSes results in storage of data that are neither useful long term nor in contention among multiple users or clients. [Signals]({{< relref signals.md >}}) are designed for sending transient data and would be more appropriate in this situation. Each user can broadcast a signal containing their selection data to all connected users, and those users can store the data locally. Newly connected users can request other connected users to send their selection data using another signal. When a user disconnects, the local data are discarded.

#### Unshared data

In some cases, the user data could be generated locally or fetched from an external service. For example, consider a scenario where you want to display the connected users with a profile picture and a color border. If your app retrieves a user's profile picture from a user metadata service and assigns each user a color based on a hash of their user ID, then the app will have the desired data on other users without needing to communicate with them.

<!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=docs/_includes/links.md) -->
<!-- Links -->

<!-- Concepts -->

[Fluid container]: {{< relref "containers.md" >}}

<!-- Distributed Data Structures -->

[SharedCounter]: {{< relref "/docs/data-structures/counter.md" >}}
[SharedMap]: {{< relref "/docs/data-structures/map.md" >}}
[SharedSequence]: {{< relref "/docs/data-structures/sequences.md" >}}
[SharedString]: {{< relref "/docs/data-structures/string.md" >}}

<!-- API links -->

[fluid-framework]: {{< relref "/docs/apis/fluid-framework.md" >}}
[@fluidframework/azure-client]: {{< relref "/docs/apis/azure-client.md" >}}
[@fluidframework/tinylicious-client]: {{< relref "/docs/apis/tinylicious-client.md" >}}

[AzureClient]: {{< relref "/docs/apis/azure-client/AzureClient-class.md" >}}
[TinyliciousClient]: {{< relref "/docs/apis/tinylicious-client/TinyliciousClient-class.md" >}}

[FluidContainer]: {{< relref "/docs/apis/fluid-static/fluidcontainer-class.md" >}}
[IFluidContainer]: {{< relref "/docs/apis/fluid-static/ifluidcontainer-interface.md" >}}

<!-- AUTO-GENERATED-CONTENT:END -->
