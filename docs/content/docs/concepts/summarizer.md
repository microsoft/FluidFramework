---
title: Summarizer
menuPosition: 10
status: outdated
aliases:
  - "/docs/advanced/summarizer/"
  - "/docs/deep/summarizer/"
---

Summaries are client-generated snapshots of the state of the document at a given sequence number. A summary is a
consolidation of the operation (op) log into one JSON blob.

## Why have summaries?

Summaries allow new clients to quickly catch up to recent state.

Without a summary, the client would have to apply every operation in the op log, even if those operations no longer affected the current state (e.g. op 1 inserts 'h' and op 2 deletes 'h').
For very large op logs, this would be very expensive.

Instead, when a client joins a collaborative document, they can instead download a summary of the document state, and simply process new operations from that point foreward.

## What do I need to know?

Ideally very little.
If you are building on top of our runtime and [distributed data structure]({{< relref "glossary.md#distributed-data-structures-ddses" >}})s (DDSes), then you won't need to think about the summary at all.

When users with significant latency use your application, they may see the state of the container at the summary and then see new operations get applied.
This can be hidden by waiting for the Container to be fully connected, or by allowing users to see recent changes.

## Summary lifecycle

The lifecycle of a summary starts when the [Summary Manager](#summary-manager) selects the client that will summarize the state of the container.

1. The selected client spawns a non-user runtime (including a quorum, clientId, and container) that will generate the summary.
2. The runtime generates summary tree (more details [below](#shape-of-a-summary)).
    - The timing of the summaries is determined by a few heuristics discussed below
3. The runtime uploads summary tree to the Fluid Service storage (Historian), which returns a handle to the data.
4. The runtime submits a "summarize" op to the server containing that uploaded summary handle.
5. The ordering service on server stamps and broadcasts the "summarize" op.
6. Another service on server responds to "summarize" op.
    - The server can reject the summary by sending a "summaryNack" (summary negative acknowledgement) op referencing the sequence number of the "summarize" op.
    - The server can accept the summary, but first it must serialize the protocol state and add it to the posted summary.
      Then it will need to send a "summaryAck" (summary acknowledgement) op with the new handle to the augmented summary.
7. The runtime watches for "summaryAck"/"summaryNack" ops, using them as input to its heuristics determining when to generate summaries

## Summarizing

The job of summarizing consists of multiple parts within the runtime. All summarizing is done in a separate,
non-user runtime that never generates operations. This guarantees that the summarizer agent only has state that is securely
saved in the Fluid service. Generally, the summarizer agent resides on the client although the Summary Manager could be modified
to choose a different host.

### Summary manager

The **summary manager** runs on every connected client, and its primary role is to decide which client should be
responsible for summarizing, and then spawning and managing the separate "summarizer" client.

A client is "elected" to be responsible for summarizing simply by being the oldest member of the quorum. The Summary
manager is a state machine that checks for state changes any time it connects/disconnects or a member joins/leaves the
quorum. Because client join/leave messages are sequenced in the quorum, it is sufficient to check if this client is
first in the list of clients, since all clients will have this same information at any given sequence number. It's
important to keep this simple and deterministic to prevent accidentally spawning multiple summarizer clients or not
spawning one at all.

Once a client decides it is responsible for spawning a summarizer client, it will make a request through the loader with
special parameters to force a new container, and indicate that it is not interactive. It will call run on that spawned
client and listen for it to disconnect/finish running.

### Summarizer

Once a client spawns a summarizer client, the summarizer client will use the Summarizer object for heuristics around
actually generating the summaries. The underlying data structure will watch the ops to keep track of what summaries have
been seen so far, as well as how many ops/how much time has passed since the last summary.

The configuration for heuristics are provided by the server. They consist of several points:

- `maxOps` -- the maximum number of ops since the last successful summary before trying to summarize again
- `maxTime` -- the maximum amount of time since the last successful summary before trying to summarize again
- `idleTime` -- the amount of time to wait while idle before summarizing
- `maxAckWaitTimeout` -- the maximum amount of time to wait for an ack or nack from the server in response to a summary op

In general, the summarizer will wait for a break from ops before trying to summarize. This is the `idleTime`
configuration. If the client receives no ops for `idleTime` (15 sec currently), then it will make a summary attempt. If
an op comes in, it will reset the idle timer.

Even if ops are consistently coming in before the `idleTime` is hit, if `maxOps` (500 ops currently) ops are received or
`maxTime` (1 minute currently) passes since the last successful summary, the client will attempt to summarize anyway.

The Summarizer defers to the rest of the runtime to actually generate the summary, upload it to storage, and submit the
op. Once complete, it will watch for the summary op to be broadcast, and then keep waiting for the summary ack or nack
op to come in from the server in response. It will not try to generate another summary while waiting for the ack/nack
op. In most cases, the server should respond quickly with the ack/nack. In some bad cases, it may never come or take too
long, in this case the client will not wait longer than `maxAckWaitTimeout` before trying to generate and send another
summary.

#### Retry in "safe" mode

When an unexpected error is encountered while summarizing or the server sends a nack, the runtime will retry one more
time in "safe" mode. This does two things:

1. It first asks the server what the latest successful summary ID is. It does this to be resilient to issues with its
   own state tracking. This works around the issue where a summary is actually accepted by the server, but it fails to
   send an ack op.
2. It then generates the summary with `fullTree` set to true. This will prevent any subtree reuse optimizations. It will
   try to generate the entire tree, regardless of whether it has changed since last summary or not.

### Container runtime

The Container runtime is actually responsible for generating the summary, uploading it to storage, and submitting the
op.

#### Generating the Summary

The Container runtime stores partially received chunked ops in a separate blob. It will then loop through all the Fluid
Data Stores it has bound to it and call their respective summarize functions.

Each Fluid Data Store Context will store its metadata in a blob. It will then load/realize itself which loads its Fluid
Data Store Runtime, and call its internal summarize function. The Fluid Data Store Runtime will then loop through each
DDS it has and call their summarize functions.

Similarly, each DDS will store its metadata in a blob. It will ensure it is loaded and call its custom serialize
function.

### Summarizer Node

Within these layers of summary generation, common functionality is encapsulated by the Summarizer Node object. The
Summarizer Nodes form a tree parallel to the tree of Container, Fluid Data Store Contexts, and Channel Contexts
(distributed data structures). They are needed to track all the state of the completed and pending summaries relevant to
each node. The state is needed in order to help each node decide whether it can be reused from the previous summary and
whether it can generate a fallback "failure" summary in error scenarios.

They work by tracking the latest successful summary reference sequence number as well as the parent path and this node's
path part. The paths are important as they can actually change when a "failure" summary is generated. A "failure"
summary is when a Fluid Data Store encounters an error while summarizing, if possible it will instead send a handle
pointing to the last successful summary of this subtree and a blob of outstanding ops addressed to this data store since
that summary. It does this to isolate the problem to a single data store. When this happens, the summary will have
nested subtrees for every consecutive failure, which complicates the base path for child nodes in the tree.

They also decide when the subtrees can be reused by comparing their latest change sequence number with the last
successful summary sequence number. Then they use their path tracking to figure out what path to send.


## Shape of a Summary

Summaries take the form of a tree consisting of blobs. Each layer in the tree is parallel to a part of the runtime
model. The root node corresponds to the Container, and it contains the protocol information as well as any partially
processed chunk op data.

{{< mermaid >}}
graph LR
  A(["(root)"]) --> B([.protocol])
  A --> S([_scheduler])
  A --> C1([DataStore_1])
  A --> C2([DataStore_2])
  A --> CH([.chunks])
  classDef tree fill:#faa,stroke:#000
  class A,B,S,C1,C2,D1,D2,ST tree
{{< /mermaid >}}

<span class="screen-reader-text">
<label id="root-diagram">
  Describes the hierarchical structure of the summary tree from the root to the first layer of leaf nodes.
</label>
<ul labelledby="root-diagram">
  <li>root</li>
  <ul>
    <li>.protocol</li>
    <li>_scheduler</li>
    <li>DataStore_1</li>
    <li>DataStore_2</li>
    <li>.chunks</li>
  </ul>
</ul>
</span>

{{< mermaid >}}
graph LR
  DS1 --> .DS([.fluid-object])
  DS1 --> D1([DDS_1])
  DS1 --> D2([DDS_2])
  D1 --> .D([.attributes])
  D1 --> SB(["(more blobs)"])
  D1 --> ST(["(subtrees)"])
  classDef tree fill:#faa,stroke:#000
  class A,B,S,C1,C2,D1,D2,ST tree
{{< /mermaid >}}

<span class="screen-reader-text">
<label id="ds-diagram">
  Describes the hierarchical structure of the summary tree from the data store nodes.
</label>
<ul labelledby="ds-diagram">
  <li>DataStore_1</li>
  <ul>
    <li>.fluid-object</li>
    <li>DDS_1</li>
    <ul>
      <li>.attributes</li>
      <li>(more blobs)</li>
      <li>(subtrees)</li>
    </ul>
    <li>DDS_2</li>
  </ul>
</ul>
</span>

### Protocol

The protocol subtree of the summary is generated by the server. The server takes responsibility of augmenting the
proposed summary by tacking it on to the root of the tree while acknowledging it. The protocol contains information
about the quorum: including client join/leave messages and quorum proposal data. It also contains the document
attributes: document ID, sequence number, and minimum sequence number at that point in time.

{{< mermaid >}}
graph LR
  A(["(root)"]) --> B([.protocol])
  A --> S([_scheduler])
  A --> C1([DataStore_1])
  A --> C2([DataStore_2])
  A --> CH([.chunks])
  B --> QM([quorumMembers])
  B --> QP([quorumProposals])
  B --> QV([quorumValues])
  B --> DA([attributes])
  classDef tree fill:#faa,stroke:#000
  class A,B,S,C1,C2 tree
{{< /mermaid >}}

<span class="screen-reader-text">
<label id="protocol-diagram">
  Describes the hierarchical structure of the summaries.
</label>
<ul labelledby="protocol-diagram">
  <li>root</li>
  <ul>
    <li>.protocol</li>
    <ul>
      <li>quorumMembers</li>
      <li>quorumProposals</li>
      <li>quorumValues</li>
      <li>attributes</li>
    </ul>
    <li>_scheduler</li>
    <li>DataStore_1</li>
    <li>DataStore_2</li>
  </ul>
</ul>
</span>

### Fluid Data Stores

The second layer consists of a subtree for each Fluid Data Store which has been attached and bound to the container.
They must have a unique ID, which is generally decided by the runtime to prevent collisions. This will be a flattened
list of all bound data stores. Nested data stores referenced by handles are irrelevant to the structure of this graph.

Each Fluid Data Store subtree will have a single metadata blob containing information about how to load its code.

### Distributed data structures

The third layer consists of a subtree for every DDS found within each Fluid Data Store.
They also have a unique ID generated by the runtime.
The parent node is the Fluid Data Store to which the DDS is bound, so this graph is irrelevant to how a DDS can reference another by its handle.

They will have a single metadata blob containing information for how to load the code given the registry collections
found in higher layers. Each subtree may have other blobs or subtrees as needed.

### Summary handles

Sometimes nodes/subtrees within the summary remain unchanged since the last successful summary, or want to be reused by
the next summary. In this case, when uploading a summary, handles can be used in place of trees or blobs. Handles are
pointers to nodes within the previous tree. The handle itself is just a full path to the node it is referencing, for
example: "/dataStoreId/ddsId" would reference the subtree for the data structure with ID "ddsId" within the data store
with ID "dataStoreId". When uploading to storage, the driver uses this path in conjunction with the previously uploaded
summary ID to resolve these handles.

