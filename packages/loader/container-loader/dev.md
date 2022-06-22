# @fluidframework/container-loader

This document was created to provide condensed readable summaries of the more nuanced inner workings of the container-loader service. 

**Topics covered below:**
- [@fluidframework/container-loader](#fluidframeworkcontainer-loader)
  - [ConnectionState Change Transitions](#connectionstate-change-transitions)
    - [What happens when a client gets disconnected?](#what-happens-when-a-client-gets-disconnected)
    - [Join & Leave Ops](#join--leave-ops)

## ConnectionState Change Transitions

A Delta Manager class is used to handle connect, disconnect, throttle and other events.

### What happens when a client gets disconnected?

If a client (Client A) gets disconnected for any reason, the prevClientLeftTimer is started. This means we wait for some time for the server to broadcast a leave op for Client A. This only happens once to prevent any timer resets on multiple disconnect events. 

NOTE: A client that disconnects can NOT reconnect again with the same clientID. Client IDs are assigned when socket round trip is successful.

### Join & Leave Ops
These operations are broadcasted by the server to all clients notifying them that a client has joined/left. They're associated with the appropriate client ID
The quorum processes system ops and represents the active collaborators and what they've agreed on.
Quorum receives a join op from the server.
- This triggers an addMember event to be emitted, putting the (new) client in the Connecting state. 
- If we're NOT waiting for the leave op of an older client, we can transition this new client to Connected state immediately.
- If prevClientLeftTimer has started, that means a client recently disconnected and we're waiting for its leave op as a confirmation that we can transition the new client into Connected state.

Quorum receives a leave op from the server.
- This triggers a removeMember event to be emitted. If the client that left was us, clear the prevClientLeftTimer.