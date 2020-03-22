# Loader and Container

- [`Fluid loader`](#Fluid-loader)
- [`Audience`](#Audience)
- [`Error Handling`](#Error-handling)
- [`Connectivity events`](#Connectivity-events)
- [`Proposal Lifetime`](#Proposal-lifetime)

## Fluid Loader

The loader makes up the minimal kernel of the Fluid runtime. This kernel is responsible for providing access to
Fluid storage as well as consensus over a quorum of clients.

Storage includes snapshots as well as the live and persisted operation stream.

The consensus system allows clients within the collaboration window to agree on document properties. One
example of this is the npm package that should be loaded to process operations applied to the document.

## Audience
**Container.audience** exposes an object that tracks all connected clients to same document.
- **getMembers()** can be used to retrieve current set of users
- **getMember()** can be used to get IClient information about particular client (returns undefined if such client is not connected)
- **"addMember"** event is raised when new member joins
- **"removeMember"** event is raised when an earlier connected member leaves (disconnects from document)

**getMembers()** and **"addMember"** event provide _IClient_ interface that describes type of connection, permissions and user information. IClient.mode in particular describes connectivity mode of a client:
- "write" means client has read/write connection, can change document, and participates in Quorum
- "read" indicates client as read connection. Such clients can't modify document and do not participate in quorum. That said, "read" does not indicate client permissions, i.e. client might have read-only permissions to a file, or maybe connected temporarily as read-only, to reduce COGS on server and not "modify" document (any read-write connection generates join & leave messages that modify document and change "last edited by" property)

Please note that if this client losses connection to ordering server, then audience information is not reset at that moment. It will become stale while client is disconnected, and will refresh the moment client connects back to document. For more details, please see [`Connectivity events`](#Connectivity-events) section

## Error handling

There are two ways errors are exposed:
1. At open time, by returning rejected promise from Loader.resolve() or Loader.request()
2. As an **"error"** event on resolved container.

Most errors can shows up on both workflows. For example, URI may point to deleted file, which will result in errors on container open. But file can also be deleted while container is opened, resulting in same error type being raised through "ereor" handler.

Errors raised by those two paths are typed: errors are of [IError](../driver-definitions/src/error.ts) type, which is a union of interfaces that have one thing in common - they have the following  field, describing type of an error (and appropriate interface of error object):
>     readonly errorType: ErrorType.generalError;
ErrorType enum represents all  error types that can be raised by container.
For a fill list of error interfaces please see interfaces that are part of [IError](../driver-definitions/src/error.ts) type.

Please note that not all errors raised through this mechanism are catastrophic in nature. For example, **IThrottlingError** indicates likely temporary service issue. Errors contain **critical** field indicating if it's critical error or not:
>     critical?: boolean;
 That said, it's recommended to listed on **"closed"** event instead of relying on this field. **"closed"** event is raised when container is closed, i.e. it no longer connected to ordering service due to some error. An event contains optional error object of IError type describing the reason for closure, or no error if container was closed due to host application calling Container.close() (without specifying error).

## Connectivity events
Container raises 2  events to notify hosting application about connectivity issues and connectivity status.
- **"connected"** is raised when container is connected and is up-to-date, i.e. changes are flowing between client and server.
- **"disconnected"** is raised when container lost connectivity (for any reason).

Container also exposes **Container.connected** property to indicate current state.

In normal circumstances, container will attempt to reconnect back to ordering service as quickly as possible. But it will scale down retries if computer is offline.  That said, if IThrottlingError error is raised through **"error"** handler, then container is following storage throttling policy and will attempt to reconnect after some amount of time (**IThrottlingError.retryAfterSeconds**).

Container will also not attempt to reconnect on lost connection if **Container.setAutoReconnect(false)** was called prior to loss of connection. This might be useful if hosting application implements "user away" type of experience to reduce cost on both client and server of maintaining connection while user is away. Calling setAutoReconnect(true) will reenable automatic reconnections, but host might need to allow extra time for reconnection as it likely involves token fetch and processing of a lot of ops generated by other clients while this client was not connected.

Hosting applicaion can use these events in order to indicate to user when user changes are not propagating through the system, and thus can be lost (on browser tab being closed). It's advised to use some delay (like 5 seconds) before showing such UI, as network connectivity might be intermittent.  Also if container was offline for very long period of time due to **Container.setAutoReconnect(false)** being called, it might take a while to get connected and current.

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
