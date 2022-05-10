# @fluidframework/container-loader

**Topics covered below:**

- [@fluidframework/container-loader](#fluidframeworkcontainer-loader)
  - [Fluid Loader](#fluid-loader)
  - [Expectations from host implementers](#expectations-from-host-implementers)
  - [Expectations from container runtime and data store implementers](#expectations-from-container-runtime-and-data-store-implementers)
  - [Container Lifetime](#container-lifetime)
    - [Loading](#loading)
    - [Connectivity](#connectivity)
    - [Closure](#closure)
  - [Audience](#audience)
  - [ClientID and client identification](#clientid-and-client-identification)
  - [Error handling](#error-handling)
  - [Connectivity events](#connectivity-events)
  - [Readonly states](#readonly-states)
    - [`readonly`](#readonly)
    - [`permissions`](#permissions)
    - [`forced`](#forced)
    - [`storageOnly`](#storageonly)
  - [Dirty events](#dirty-events)

**Related topics covered elsewhere:**

- [Quorum and Proposals](../../../server/routerlicious/packages/protocol-base/README.md)


## Fluid Loader

The loader makes up the minimal kernel of the Fluid runtime. This kernel is responsible for providing access to
Fluid storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on container's properties. One
example of this is the npm package that should be loaded to process operations applied to the container.

## Expectations from host implementers

It's expected that host will listen to various events described in other sections of this document and conveys correctly (in some form) information to the user to ensure that user is aware of various situations and is not going to lose data.
Please see specific sections for more details on these states and events - this section only serves as a summary and does not go into details.

1. ["disconnected" and "connected"](#Connectivity-events) event: Host can either notify user about no connectivity (and potential data loss if container is closed) or disallow edits via `Container.forceReadonly(true)`
2. ["closed"](#Closure) event: If raised with error, host is responsible for conveying error in some form to the user. Container is left in disconnected & readonly state when it is closed (because of error or not).
3. ["readonly"](#Readonly-states) event: Host should have some indication to user that container is not editable. User permissions can change over lifetime of Container, but they can't change per connection session (in other words, change in permissions causes disconnect and reconnect). Hosts are advised to recheck this property on every reconnect.
4. [Dirty events](#Dirty-events): Host should have some reasonable UX / workflows to ensure user does not lose edits unexpectedly. I.e. there is enough signals (potentially including blocking user from closing container) ensuring that all user edits make it to storage, unless user explicitly choses to lose such edits.

## Expectations from container runtime and data store implementers

1. Respect ["readonly" state](#Readonly-states). In this state container runtime (and data stores) should not allow changes to local state, as these changes will be lost on container being closed.
2. Maintain Ops in flight until observed they are acknowledged by server. Resubmit any lost Ops on reconnection. This is done by DDSes in stock implementations of container & data store runtimes provided by Fluid Framework
3. Respect "["disconnected" and "connected"](#Connectivity-events) states and do not not submit Ops when disconnected.
4. Respect ["dispose"](#Closure) event and treat it as combination of "readonly" and "disconnected" states. I.e. it should be fully operatable (render content), but not allow edits. This is equivalent to "closed" event on container for hosts, but is broader (includes container's code version upgrades).
5. Notify Container about presence or lack of unsaved changed through IContainerContext.updateDirtyContainerState callback. This is required for [Dirty events](#Dirty-events) to correctly represent state of user edits to host.

## Container Lifetime

### Loading

Container is returned as result of Loader.resolve() call. Loader can cache containers, so if same URI is requested from same loader instance, earlier created container might be returned. This is important, as some of the headers (like `pause`) might be ignored because of Container reuse.

`ILoaderHeader` in [loader.ts](../../../common/lib/container-definitions/src/loader.ts) describes properties controlling container loading.

### Connectivity

Usually container is returned when state of container (and data stores) is rehydrated from snapshot. Unless `IRequest.headers.pause` is specified, connection to ordering service will be established at some point (asynchronously) and latest Ops would be processed, allowing local changes to flow form client to server. `Container.connectionState` indicates whether connection to ordering service is established, and  [Connectivity events](#Connectivity-events) are notifying about connectivity changes. While it's highly recommended for listeners to check initial state at the moment they register for connectivity events, new listeners are called on registration to propagate current state. That is, if a container is disconnected when both "connected" and "disconnected" listeners are installed, newly installed listeners for "disconnected" event will be called on registration.

### Closure

Container can be closed directly by host by calling `Container.close()`. Once closed, container terminates connection to ordering service, and any local changes (former or future) do not propagate to storage.

Container can also be closed by runtime itself as result of some critical error. Critical errors can be internal (like violation in op ordering invariants), or external (file was deleted). Please see [Error Handling](#Error-handling) for more details

When container is closed, the following is true (in no particular order):

1. Container.closed property is set to true
2. "closed" event fires on container with optional error object (indicating reason for closure; if missing - closure was due to host closing container)
3. "readonly" event fires on DeltaManager & Container (and Container.readonly property is set to true)  indicating to all data stores that container is read-only, and data stores should not allow local edits, as they are not going to make it.
4. "disconnected" event fires, if connection was active at the moment of container closure.

`"closed"` event is available on Container for hosts. `"disposed"` event is delivered to container runtime when container is closed. But container runtime can be also disposed when new code proposal is made and new version of the code (and container runtime) is loaded in accordance with it.

## Audience

`Container.audience` exposes an object that tracks all connected clients to same container.

- `getMembers()` can be used to retrieve current set of users
- `getMember()` can be used to get IClient information about particular client (returns undefined if such client is not connected)
- `"addMember"` event is raised when new member joins
- `"removeMember"` event is raised when an earlier connected member leaves (disconnects from container)

`getMembers()` and `"addMember"` event provide _IClient_ interface that describes type of connection, permissions and user information:

- clientId is the key - it is unique ID for a session. Please see [ClientID and client identification](#ClientId-and-client-identification) for more details on it, as well as how to properly differentiate human vs. agent clients and difference between client ID & user ID.
- IClient.mode in particular describes connectivity mode of a client:
  - "write" means client has read/write connection, can change container contents, and participates in Quorum
  - "read" indicates client as read connection. Such clients can't modify container and do not participate in quorum. That said, "read" does not indicate client permissions, i.e. client might have read-only permissions to a file, or maybe connected temporarily as read-only, to reduce COGS on server and not "modify" container (any read-write connection generates join & leave messages that modify container and change "last edited by" property)

Please note that if this client losses connection to ordering server, then audience information is not reset at that moment. It will become stale while client is disconnected, and will refresh the moment client connects back to container. For more details, please see [Connectivity events](#Connectivity-events) section

## ClientID and client identification

`Container.clientId` exposes ID of a client. Ordering service assigns unique random IDs to all connected clients. Please note that if same user opened same container on 3 different machines, then there would be 3 clientIDs tracking 3 sessions for the same user.

A single user connecting to a container may result in multiple sessions for the container (and thus multiple clientID). This is due to various agents (including summarizing agents) working along humans. You can leverage `IClient.details.capabilities.interactive` to differentiate humans vs. agents. This property should be used to filter out bots when exposing user presence (like in coauth gallery)

IClient.user represents user ID (in storage) and can be used to identify sessions from same user (from same or different machines).

## Error handling

There are two ways errors are exposed:

1. At open time, by returning rejected promise from Loader.resolve() or Loader.request()
2. As a `"closed"` event on container, when container is closed due to critical error.
3. As a `"warning"` event on container.

Critical errors can show up in #1 & #2 workflows. For example, data store URI may point to a deleted file, which will result in errors on container open. But file can also be deleted while container is opened, resulting in same error type being raised through "error" handler.

Errors are of [ICriticalContainerError](../../../common/lib/container-definitions/src/error.ts) type, and warnings are of [ContainerWarning](../../../common/lib/container-definitions/src/error.ts) type. Both have `errorType` property, describing type of an error (and appropriate interface of error object):

```ts
     readonly errorType: string;
```

There are 3 sources of errors:

1. [ContainerErrorType](../../../common/lib/container-definitions/src/error.ts) - errors & warnings raised at loader level
2. [OdspErrorType](../../drivers/odsp-driver/src/odspError.ts) and [R11sErrorType](../../drivers/routerlicious-driver/src/documentDeltaConnection.ts) - errors raised by ODSP and R11S drivers.
3. Runtime errors, like `"summarizingError"`, `"dataCorruptionError"`. This class of errors is not pre-determined and depends on type of container loaded.

`ICriticalContainerError.errorType` is a string, which represents a union of 3 error types described above. Hosting application may package different drivers and open different types of containers, and only hosting application may have enough information to enumerate all possible error codes in such scenarios.

Hosts must listen to `"closed"` event. If error object is present there, container was closed due to error and this information needs to be communicated to user in some way. If there is no error object, it was closed due to host application calling Container.close() (without specifying error).
When container is closed, it is no longer connected to ordering service. It is also in read-only state, communicating to data stores not to allow user to make changes to container.

## Connectivity events

Container raises two events to notify hosting application about connectivity issues and connectivity status.

- `"connected"` event is raised when container is connected and is up-to-date, i.e. changes are flowing between client and server.
- `"disconnected"` event is raised when container lost connectivity (for any reason).

Container also exposes `Container.connectionState` property to indicate current state.

In normal circumstances, container will attempt to reconnect back to ordering service as quickly as possible. But it will scale down retries if computer is offline.  That said, if IThrottlingWarning is raised through `"warning"` handler, then container is following storage throttling policy and will attempt to reconnect after some amount of time (`IThrottlingWarning.retryAfterSeconds`).

Container will also not attempt to reconnect on lost connection if `Container.disconnect()` was called prior to loss of connection. This can be useful if the hosting application implements "user away" type of experience to reduce cost on both client and server of maintaining connection while user is away. Calling `Container.connect()` will reenable automatic reconnections, but the host might need to allow extra time for reconnection as it likely involves token fetch and processing of a lot of Ops generated by other clients while it was not connected.

Data stores should almost never listen to these events (see more on [Readonly states](#Readonly-states), and should use consensus DDSes if they need to synchronize activity across clients. DDSes listen for these events to know when to resubmit pending Ops.

Hosting application can use these events in order to indicate to user when user changes are not propagating through the system, and thus can be lost (on browser tab being closed). It's advised to use some delay (like 5 seconds) before showing such UI, as network connectivity might be intermittent.  Also if container was offline for very long period of time due to `Container.setAutoReconnect(false)` being called, it might take a while to get connected and current.

Please note that hosts can implement various strategies on how to handle disconnections. Some may decide to show some UX letting user know about potential loss of data if container is closed while disconnected. Others can force container to disallow user edits while offline (see [Readonly states](#Readonly-states)).

It's worth pointing out that being connected does not mean all user edits are preserved on container closure. There is latency in the system, and loader layer does not provide any guarantees here. Not every implementation needs a solution here (games likely do not care), and thus solving this problem is pushed to framework level (i.e. having a data store that can expose `'dirtyDocument'` signal from ContainerRuntime and request route that can return such data store).

## Readonly states
User permissions can change over lifetime of Container. They can't change during single connection session (in other words, change in permissions causes disconnect and reconnect). Hosts are advised to recheck this property on every reconnect.

DeltaManager will emit a `"readonly"` event when transitioning to a read-only state. Readonly events are accessible by data stores and DDSes (through ContainerRuntime.deltaManager). It's expected that data stores adhere to requirements and expose read-only (or rather 'no edit') experiences.

`Container.readOnlyInfo` (and `DeltaManager.readOnlyInfo`) indicates to host if file is writable or not.
### `readonly`
one of the following:
- true: Container is readonly. One or more of the additional properties listed below will be true.
- undefined: Runtime does not know yet if file is writable or not. Currently we get a signal here only when websocket connection is made to the server.
- false: Container.forceReadonly() was never called or last call was with false, plus it's known that user has write permissions to a file.

### `permissions`
There are two cases when it's true:

1. User has no write permissions to to modify this container (which usually maps to file in storage, and lack of write permissions by a given user)
2. Container was closed, either due to critical error, or due to host closing container. See [Container Lifetime](#Container-lifetime) and [Error Handling](#Error-handling) for more details.

### `forced`
Hosts can also force readonly-mode for a container via calling `Container.forceReadonly(true)`. This can be useful in scenarios like:

- Loss of connectivity, in scenarios where host chooses method of preventing user edits over (or in addition to) showing disconnected UX and warning user of potential data loss on closure of container
- Special view-only mode in host. For example can be used by hosts for previewing container content in-place with other host content, and leveraging full-screen / separate window experience for editing.

### `storageOnly`
Storage-only mode is a readonly mode in which the container does not connect to the delta stream and is unable to submit or recieve ops. This is useful for viewing a specific version of a document.

## Dirty events
The Container runtime can communicate with the container to get the container's current state. In response, the container will raise two events - `"dirty"` and `"saved"` events. Transitions between these two events signify presence (or lack of) user changes that were not saved to storage. In other words, if container is dirty, closing it at that moment will result in data loss from user perspective, because not all user changes made it to storage.
This information can be used by a host to build appropriate UX that allows user to be confident in the platform. For example, a host may chose to show a dialog asking the user if they want to save their changes before closing. Instead of, or in addition to this, the host may choose to show "Saving..." and "Saved" text somewhere in UX. Coupled with lack of connectivity to ordering service (and appropriate notification to the user) that may create enough continuous notification to user not to require a blocking dialog on closing.
Note that when an active connection is in place, it's just a matter of time before changes will be flushed to storage unless there is some source of continuous local changes being generated that prevents container from ever being fully saved. But if there is no active connection, because the user is offline, for example, then a document may stay in a dirty state for very long time.

`Container.isDirty` can be used to get current state of container.
