---
title: User presence and audience
menuPosition: 5
editor: tylerbutler
---

## Overview

The audience is the collection of users connected to a container.  When you create a container using a service-specific client package, you are provided a service-specific audience object for that container as well.  You can query the audience for connected users and use that information to build rich and collaborative user presence features.

This document will explain how to use the audience APIs and then provide examples on how to use the audience to show user presence.  For anything service-specific, `tinylicious-client` is used.

## Working with the audience

When creating a container, you are also provided a container services object which holds the audience.  This audience is backed by that same container.

```typescript
const { container, containerServices } =
    await tinyliciousClient.createContainer(serviceConfig, containerSchema);
const audience = containerServices.audience;
```

{{% callout tip %}}

The backing container controls the audience by adding and removing members as part of processing ops (see [Total Order Broadcast & Eventual Consistency]({{< relref tob.md >}})).  This means audience membership reflects the container's processed ops rather than live information from the service, and delays in op processing may also produce outdated audience information.

{{% /callout %}}

### The IMember

Audience members exist as `IMember` objects:

```typescript
export interface IMember {
    userId: string;
    connections: IConnection[];
}
```

An `IMember` represents a single user identity.  `IMember` holds a list of `IConnection`s, which represent that audience member's active connections to the container.  Typically a user will only have one connection, but scenarios such as loading the container in multiple web contexts or on multiple computers will also result in as many connections.  An audience member will always have at least one connection.  Each user and each connection will both have a unique indentifier.

{{% callout tip %}}

Connections can be short-lived and are not reused. A client that disconnects from the container and immediately reconnects will receive an entirely new connection.  The audience will reflect through its [member leaving and member joining events](#events).

{{% /callout %}}

### Service-specific audience data

The `ServiceAudience` class represents the base audience implementation, and individual services are expected to extend this class for their needs.  Typically this is through extending `IMember` to provide richer user information and then extending `ServiceAudience` to use the `IMember` extension.  For `TinyliciousAudience`, this is the only change, and it defines a `TinyliciousMember` to add a user name.

```typescript
export interface TinyliciousMember extends IMember {
    userName: string;
}
```

### APIs

#### getMembers

The `getMembers` method returns a map of the audience's current members.  The map keys are user IDs (i.e. the `IMember.userId` property), and values are the `IMember` for that user ID.  You can further query the individual `IMember`s for its client connections.

{{% callout tip %}}

Because `ServiceAudience` exists to facilitate user presence scenarios, it may exclude certain client connections it doesn't consider useful for this purpose.  By default, this includes non-interactive clients such as the summarizer client (also see [Summarization]({{< relref summarizer.md >}})).

{{% /callout %}}

{{% callout tip %}}

The map returned by `getMembers` represents a snapshot in time and will not update internally as members enter and leave the audience.  Instead of holding onto the return value, you should subscribe to `ServiceAudience`'s events for member changes.

{{% /callout %}}

#### getMyself

The `getMyself` method returns the `IMember` object from the audience corresponding to the current user calling the method.  It does so by matching the container's current client connection ID with one from the audience.

{{% callout tip %}}

Connection transitions can result in short timing windows where `getMyself` returns undefined.  This is because the current client connection will not have been added to the audience yet, so a matching connection ID cannot be found.  Similarly, offline scenarios may produce the same behavior.

{{% /callout %}}

### Events

#### membersChanged

The `membersChanged` event is emitted whenever a change to the audience members' client connections is made and will always be paired with a `memberAdded` or `memberRemoved` event.  Listeners may call the `getMembers` method to get the new list of members and their connections.  Listeners that need the specific changed member or connection should use the `memberAdded` and `memberRemoved` events instead.

#### memberAdded

The `memberAdded` event is emitted whenever a client connection is added to the audience.  The event also provides the connection client ID and the `IMember` object for this change.  The `IMember` may be queried for more information on the new connection using the provided connection client ID.  Depending on if it already had previous connections, the `IMember` may be either new or existing.

#### memberRemoved

The `memberRemoved` event is emitted whenver a client connection leaves the audience.  The event also provides the connection client ID and the `IMember` object for this change.  The `IMember` reflects its state in the audience before the connection's removal, and may be queried for more information on the removed connection using the provided connection client ID.

## Using audience to build presence features

### Data management and inter-user communication

While the audience is the foundation for user presence features, the list of connected users does not provide a compelling experience on its own.  Building compelling presence features will involve working with additional user data. These data typically fit into one or more of the categories below.

#### Shared persisted data

Most presence scenarios will involve data that only a single user or client knows and needs to communicate to other audience members.  Some of those scenarios will require you to save data for each user for future sessions.  For example, consider a scenario where you want to display how long each user has spent in your application.  An active user's time should increment while connected, pause when they disconnect, and resume once they reconnect.  This means that the time each user has spent must be persisted so it can survive disconnections.

One option is to use a `SharedMap` with a `SharedCounter` as the value onto which each user will increment their time spent every minute (also see [Introducing distributed data structures]({{< relref dds.md >}})).  All other connected users will then receive changes to that SharedMap automatically.  Your UI can display data from the map for only users present in the audience.  A returning user can find themselves in the map and resume from the latest state.

#### Shared transient data

Many presence scenarios involve data that are short-lived and do not need to be persisted.  For example, consider a scenario where you want to display where each user has selected in your UI.  Each user will need to tell other users their own information -- where they clicked -- but the past data are irrelevant.

You can address this scenario using DDSes in the same way as with the persisted data scenario.  However, using DDSes results in storage of data that are neither useful long term nor in contention among multiple users or clients.  [Signals]({{< relref signals.md >}}) are designed for sending transient data and would be more appropriate in this situation.  Each user can broadcast a signal containing their selection data to all connected users, and those users can store the data locally.  Newly connected users can request other connected users to send their selection data using another signal.  When a user disconnects, the local data are discarded.

#### Unshared data

In some cases, the user data could be generated locally or fetched from an external service. For example, consider a scenario where you want to display the connected users with a profile picture and a color border. If you retrieve a user's profile picture from your user metadata service and assign each user a color based on a hash of their user ID, you will have the desired data on other users without needing to communicate with them.
