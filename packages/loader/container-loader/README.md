# Loader and Container

- [Expectations from host implementers](#Expectations-from-host-implementers)
- [Expectations from container runtime and components implementers](#Expectations-from-container-runtime-and-components-implementers)
- [Fluid loader](#Fluid-loader)
- [Container Lifetime](#Container-lifetime)
- [Audience](#Audience)
- [ClientID and client identification](#ClientId-and-client-identification)
- [Error Handling](#Error-handling)
- [Connectivity events](#Connectivity-events)
- [Readonly states](#Readonly-states)
- [Proposal Lifetime](#Proposal-lifetime)

## Expectations from host implementers
It's expected that host will listen to various events described in other sections of the document and conveys correctly (in some form) information to the user to ensure that user is aware of various situations and is not going to lose data.
Please see specific sections for more details on these states and events - this section only serves as a summary and does not go into details
1. ["disconnected" and "connected"](#Connectivity-events) event: Host can either notify user about no connectivity (and potential data loss if container is closed) or disallow edits via `Container.forceReadonly(true)`
2. ["closed"](#Closure) event: If raised with error, host is responsible for conveying error in some form to the user. Container is left in disconnected & readonly state when it is closed (because of error or not).
3. ["readonly"](#Readonly-states) event: Host should have some indication to user that document is not editable. User permissions can change over lifetime of Container, but they can't change per conneciton session (in other words, change in permissions causes disconnect and reconnect). Hosts are advised to recheck this property on every reconnect.

## Expectations from container runtime and components implementers
1. Respect ["readonly" state](#Readonly-states). In this state container runtime (and components) should not allow changes to local state, as these changes will be lost on container being closed.
2. Maintain Ops in flight until observed they are acknowledged by server. Resubmit any lost Ops on reconnection. This is done by DDSs in stock implementations of container & component runtimes provided by Fluid Framework
3. Respect "["disconnected" and "connected"](#Connectivity-events) states and do not not submit Ops when disconnected.
4. Respect ["dispose"](#Closure) event and treat it as combination of "readonly" and "disconnected" states. I.e. it should be fully operatable (render content), but not allow edits. This is equivalent to "closed" event on container for hosts, but is broader (includes document's code version upgrades).

## Fluid Loader

The loader makes up the minimal kernel of the Fluid runtime. This kernel is responsible for providing access to
Fluid storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on document properties. One
example of this is the npm package that should be loaded to process operations applied to the document.

## Container Lifetime

### Loading

Container is returned as result of Loader.resolve() call. Loader can cache containers, so if same URI is requested from same loader instance, earlier created container might be returned. This is important, as some of the headers (like `pause`) might be ignored because of Container reuse.

`ILoaderHeader` in [loader.ts](../container-definitions/src/loader.ts) describes properties controlling container loading.

### Connectivity
Usually container is returned when state of container (and components) is rehydrated from snapshot. Unless `IRequest.headers.pause` is specified, connection to ordering service will be established at some point (asynchronously) and latest Ops would be processed, allowing local changes to flow form client to server. `Container.connected` indicates whether connection to ordering service is established, and  [Connectivity events](#Connectivity-events) are notifying about connectivity changes.

### Closure
Container can be closed directly by host by calling `Container.close()`. Once closed, container terminates connection to ordering service, and any local changes (former or future) do not propagate to storage.

Container can also be closed by runtime itself as result of some critical error. Critical errors can be internal (like violation in op ordering invariants), or external (file was deleted). Please see [Error Handling](#Error-handling) for more details

When container is closed, the following is true (in no particular order):
1. Container.closed property is set to true
2. "closed" event fires on container with optional error object (indicating reason for closure; if missing - closure was due to host closing container)
3. "readonly" event fires on DeltaManager & Container (and Container.readonly property is set to true)  indicating to all components that container is read-only, and components should not allow local edits, as they are not going to make it.
4. "disconnected" event fires, if connection was active at the moment of container closure.

`"closed"` event is available on Container for hosts. `"disposed"` event is delivered to container runtime when container is closed. But container runtime can be also disposed when new code proposal is made and new version of the code (and container runtime) is loaded in accordance with it.

## Audience
`Container.audience` exposes an object that tracks all connected clients to same document.
- `getMembers()` can be used to retrieve current set of users
- `getMember()` can be used to get IClient information about particular client (returns undefined if such client is not connected)
- `"addMember"` event is raised when new member joins
- `"removeMember"` event is raised when an earlier connected member leaves (disconnects from document)

`getMembers()` and `"addMember"` event provide _IClient_ interface that describes type of connection, permissions and user information:
- clientId is the key - it is unique ID for a session. Please see [ClientID and client identification](#ClientId-and-client-identification) for more details on it, as well as how to properly differentiate human vs. agent clients and difference between client ID & user ID.
- IClient.mode in particular describes connectivity mode of a client:
    - "write" means client has read/write connection, can change document, and participates in Quorum
    - "read" indicates client as read connection. Such clients can't modify document and do not participate in quorum. That said, "read" does not indicate client permissions, i.e. client might have read-only permissions to a file, or maybe connected temporarily as read-only, to reduce COGS on server and not "modify" document (any read-write connection generates join & leave messages that modify document and change "last edited by" property)

Please note that if this client losses connection to ordering server, then audience information is not reset at that moment. It will become stale while client is disconnected, and will refresh the moment client connects back to document. For more details, please see [Connectivity events](#Connectivity-events) section

## ClientID and client identification

`Container.clientId` exposes ID of a client. Ordering service assigns unique random IDs to all connected clients. Please note that if same user opened same document on 3 different machines, then there would be 3 clientIDs tracking 3 sessions for the same user.

A single user connecting to a document may result in multiple sessions for the document (and thus multiple clientID). This is due to various agents (including summarizing agents) working along humans. You can leverage `IClient.details.capabilities.interactive` to differentiate humans vs. agents. This property should be used to filter out bots when exposing user presence (like in coauth gallery)

IClient.user represents user ID (in storage) and can be used to identify sessions from same user (from same or different machines).

## Error handling

There are two ways errors are exposed:
1. At open time, by returning rejected promise from Loader.resolve() or Loader.request()
2. As an `"error"` event on resolved container.

Most errors can shows up on both workflows. For example, URI may point to deleted file, which will result in errors on container open. But file can also be deleted while container is opened, resulting in same error type being raised through "error" handler.

Errors raised by those two paths are typed: errors are of [IError](../driver-definitions/src/error.ts) type, which is a union of interfaces that have one thing in common - they have the following  field, describing type of an error (and appropriate interface of error object):
```ts
     readonly errorType: ErrorType.generalError;
```
ErrorType enum represents all  error types that can be raised by container.
For a fill list of error interfaces please see interfaces that are part of [IError](../driver-definitions/src/error.ts) type.

Please note that not all errors raised through this mechanism are catastrophic in nature. For example, `IThrottlingError` indicates likely temporary service issue. Errors contain `critical` field indicating if it's critical error or not:
```ts
     critical?: boolean;
```
 That said, it's recommended to listed on `"closed"` event instead of relying on this field. `"closed"` event is raised when container is closed, i.e. it no longer connected to ordering service due to some error. An event contains optional error object of IError type describing the reason for closure, or no error if container was closed due to host application calling Container.close() (without specifying error).

## Connectivity events
Container raises 2  events to notify hosting application about connectivity issues and connectivity status.
- `"connected"` event is raised when container is connected and is up-to-date, i.e. changes are flowing between client and server.
- `"disconnected"` event is raised when container lost connectivity (for any reason).

Container also exposes `Container.connected` property to indicate current state.

In normal circumstances, container will attempt to reconnect back to ordering service as quickly as possible. But it will scale down retries if computer is offline.  That said, if IThrottlingError error is raised through `"error"` handler, then container is following storage throttling policy and will attempt to reconnect after some amount of time (`IThrottlingError.retryAfterSeconds`).

Container will also not attempt to reconnect on lost connection if `Container.setAutoReconnect(false)` was called prior to loss of connection. This might be useful if hosting application implements "user away" type of experience to reduce cost on both client and server of maintaining connection while user is away. Calling setAutoReconnect(true) will reenable automatic reconnections, but host might need to allow extra time for reconnection as it likely involves token fetch and processing of a lot of Ops generated by other clients while this client was not connected.

Components should almost never listen to these events (see more on [Readonly states](#Readonly-states), and should use consensus DDSs if they need to synchronize activity across clients. DDSs listen for these events to know when to resubmit pending Ops.

Hosting application can use these events in order to indicate to user when user changes are not propagating through the system, and thus can be lost (on browser tab being closed). It's advised to use some delay (like 5 seconds) before showing such UI, as network connectivity might be intermittent.  Also if container was offline for very long period of time due to `Container.setAutoReconnect(false)` being called, it might take a while to get connected and current.

Please note that hosts can implement various strategies on how to handle disconnections. Some may decide to show some UX letting user know about potential loss of data if document is closed while disconnected. Others can force container to disallow user edits while offline (see [Readonly states](#Readonly-states)).

It's worth pointing out that being connected does not mean all user edits are preserved on container closure. There is latency in the system, and loader layer does not provide any guarantees here. Not every implementation needs a solution here (games likely do not care), and thus solving this problem is pushed to framework level (i.e. having a component that can expose `'dirtyDocument'` signal from ContainerRuntime and request route that can return such component).

## Readonly states
`Container.readonlyPermissions` (and `DeltaManager.readonlyPermissions`) indicates to host if file is writable or not. There are two cases when it's true:

1. User has no write permissions to to modify this container (which usually maps to file in storage, and lack of write permissions by a given user)
2. Container was closed, either due to critical error, or due to host closing container. See [Container Lifetime](#Container-lifetime) and [Error Handling](#Error-handling) for more details.

Please note that this property (as well as `readonly` property discussed below) can be `undefined` when runtime does not know yet if file is writable or not. Currently we get a signal here only when websocket connection is made to the server.

User permissions can change over lifetime of Container. They can't change during single connection session (in other words, change in permissions causes disconnect and reconnect). Hosts are advised to recheck this property on every reconnect.

This value is not affected by `Container.forceReadonly` calls discussed below and can be used by hosts to indicate to users if it's possible to edit a file in the absence of readonly state being overridden via `Container.forceReadonly`.

Hosts can also force readonly-mode for a container via calling `Container.forceReadonly(true)`. This can be useful in scenarios like
   - Loss of connectivity, in scenarios where host choses method od preventing user edits over (or in addition to) showing disconnected UX and warning user of potential data loss on closure of document (container)
   - Special view-only mode in host. For example can be used by hosts for previewing container content in-place with other host content, and leveraging full-screen / separate window experience for editing.

Container and DeltaManager expose `"readonly"` event and property. It can have 3 states:
- **true**: One of the following is true:
   - Container.readonlyPermissions === true
   - Container.forceReadonly(true) was called
   - Container is closed
- **false**: None of the above (Container.forceReadonly was never called or last call was with false), plus it's none that user has write permissions to a file (see below for more details)
- **undefined**: Same as above, but we do not know yet if current user has write access to a file (because there were no successful connection to ordering service yet).

Readonly events are accessible by components and DDSs (through ContainerRuntime.deltaManager). It's expected that components adhere to requirements and expose read-only (or rather 'no edit') experiences.

## Proposal lifetime

A quorum proposal transitions between four possible states: propose, accept, reject, and commit.

A proposal begins in the propose state. The proposal is sent to the server and receives a sequence number which is
used to uniquely identify it. Clients within the collaboration window accept the proposal by allowing their
reference sequence number to go above the sequence number for the proposal. They reject it by submitting a reject
message prior to sending a reference sequence number above the proposal number. Once the minimum sequence number
goes above the sequence number for the proposal without any rejections it is considered accepted.

The proposal enters the commit state when the minimum sequence number goes above the sequence number at which it
became accepted. In the commit state all subsequent messages are guaranteed to have been sent with knowledge of
the proposal. Between the accept and commit state there may be messages with reference sequence numbers prior to
the proposal being accepted.
