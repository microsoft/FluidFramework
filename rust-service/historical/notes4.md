# WebTransport flows

This document records the implemented network flow for [`sea-webtransport`](../crates/sea-webtransport/) and [`sea-sequencer`](../crates/sea-sequencer/), followed by explicitly prospective optimizations.

## Current implementation alignment

The browser adapter uses separate persistent event, author, snapshot, and content streams over one WebTransport connection.
The event stream opens the archive-bound session, returns an opaque authority, and carries snapshot selection, catch-up, and live event delivery.
The authority binds the other logical streams; all use the shared length-delimited message-kind and correlation envelope.
The author stream carries ordered submissions and receipts.
The snapshot stream carries latest-value coordination plus read-only, Sea-selected, or client-selected publication authority.
The content stream carries bounded history and immutable content operations with explicit completion.

The transport adapter should own WebTransport stream lifecycle, framing, timeouts, cancellation, and flow control.
The server sequencer should own authoritative ordering, writer sessions, reference validation, minimum-reference tracking, and rejection.
Client-side sequencing logic should track pending local operations, rebase them over received operations, and resolve ambiguous submissions; it must not independently assign authoritative order.

## Implemented Session Flow

Client creates (or already has) a WebTransport connection.

The client creates the **event stream** using `createBidirectionalStream()` and sends `OpenEventStream`.
This request includes:
- the document identifier;
- explicit create or open-existing intent;
- stable author and fresh session identities; and
- an optional event position already incorporated by the client.

The server responds with a **snapshot load** message containing:

- the selected snapshot; and
- opaque session authority that binds later logical streams.

If the request contains a required event position, the server selects the newest retained snapshot at or before that position.
Otherwise it selects the newest snapshot.
The load message is immediately followed by every event after that snapshot.
Snapshot selection and event delivery must form one gap-free load operation, although the events are separate messages.

The snapshot representation is a content-addressed root plus its event boundary.

After delivering all events that existed at the load boundary, the server sends a **caught up** marker.
New events can continue on the same stream.

The client opens an **author stream** with the authority returned by the event stream.
That stream carries ordered submissions and receipts and closes the author session explicitly.

The reference event stream position is tracked (newest sequenced position known about when the edit was authored (or last rebased)), and if different from the previous event, included before the event.

The server side sequencer needs to ensure events in the stream clearly communicate their reference sequence number, and session id.
To avoid overhead in bursts of ops from a single client this can be done simply be inserting an event whenever the session id for the next event changes, and one with the reference sequence number whenever the event has a different reference sequence number from the previous message from that client.

The server-side sequencer must define a minimum allowed reference position.
Messages with older references are rejected, and the author stream may be closed.

Wire-visible join and leave events are not required.
Connection loss, reconnect grace, session replacement, inactivity timeout, and lag eviction update authoritative membership through server liveness policy.

When a client with an active author connection updates the reference position used by future events, it must advance rather than regress.
The server can evict writers that fall behind or remain inactive according to explicit policy.

### Snapshotting

A client can subscribe to snapshots using a request shaped similarly to the event subscription request, with a distinct message type.
The event position supplied to the event subscription already provides the position-based resume behavior needed by a reconnecting client, so the snapshot subscription does not need a separate resume cursor.

The opening request declares immutable `ReadOnly`, `SeaSelected`, or `ClientSelected` participation.
When the snapshot stream opens, the server sends the latest snapshot and any Sea nomination fence assigned to this session.
It then sends newly published snapshots until the stream is closed.

Any active client-selected publisher suppresses Sea nomination.
Otherwise Sea deterministically nominates one active Sea-selected publisher.
Read-only streams cannot publish, Sea-selected publication requires the current fence, and client-selected publication omits a fence because the application owns election.
Nomination does not request snapshot generation; each client retains its own cadence policy.

Snapshot notifications have latest-value semantics by default.
If the client is backlogged, the server may coalesce pending notifications and send only the newest available snapshot because a newer snapshot supersedes the skipped snapshots for loading purposes.
The protocol must document that subscribers are not guaranteed to observe every snapshot publication.
A future subscription option may request delivery of every snapshot, with its required buffering, backpressure, and retention behavior defined separately.

## Prospective Content Optimizations

### Blobs

The storage contract, retention model, hard-link implementation, and Fluid mapping are specified in [BLOB_STORAGE.md](../BLOB_STORAGE.md).
The implemented content stream serializes correlated bounded operations and uses explicit completion.
This section describes possible future multiplexing and eager-loading optimization.

Blobs can be downloaded over a content stream using requests that contain a content digest, a versioned loading hint, and a request identifier.
Responses may interleave blobs from multiple requests and may deduplicate, throttle, or truncate recursive results.
A truncated request should return at least one useful result when possible.

Once the server will send no more blobs for a request, it sends an **end request** message containing that request identifier.
The client can issue another request if content is still missing and must not reuse an identifier while its previous request is active.

A content stream need not be permanently document-specific, but each fetch must carry enough authorization context for the server to determine whether the caller may discover and read the requested digest.

Open security and privacy questions include:

1. Should each request name a document through which the content must be reachable?
2. How can the service check reachability without preventing cross-document deduplication or making garbage collection prohibitively expensive?
3. Can a client-provided cache Bloom filter reveal sensitive content membership?
4. Does probing a digest reveal content from another document or tenant?

A non-owning document-to-digest reachability index may help authorization, but its consistency and interaction with retention remain open design questions.

#### Upload

Asynchronous clients may upload content long before an event or snapshot makes it reachable.
The upload protocol therefore needs an expiring pending-upload scope and a way to declare content roots when committing an event or snapshot.

Before committing a reference, the server verifies that the complete content graph is available and establishes its retention references.
Missing content causes a definitive rejection so the client can upload it and retry under the operation's normal identity rules.

Compression and encryption require an explicit digest and transformation domain shared with the storage contract.

## Notes

The service and each storage implementation need an internal total order to validate references and select a snapshot at or before a required position.
Public stream positions should remain opaque, but Sea does not require them to encode or validate a document or generation identity.
Clients may compare positions with `Ord`, but not perform arithmetic on them, or assume that a position's acceptance or rejection by one stream predicts its behavior in another.
Implementations validate only what they need to interpret a position safely, such as its encoding, retention, and whether the represented location is available in the selected archive.
