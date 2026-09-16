# Proposed WebTransport flows

This document sketches a target network protocol for the [native WebTransport adapter](crates/sea-webtransport/) and the [`sea-sequencer`](crates/sea-sequencer/).
It is prospective: the current Sea v1 protocol implements parts of these flows, but not the complete load, membership, snapshot, or content behavior described here.

## Current implementation alignment

The browser adapter uses separate persistent event, author, snapshot, and content streams over one WebTransport connection.
The event stream opens the archive-bound session, returns an opaque authority, and carries snapshot selection, catch-up, and live event delivery.
The authority binds the other logical streams; all use the shared length-delimited message-kind and correlation envelope.
The author stream carries ordered submissions and receipts, the snapshot stream carries latest-value coordination and fenced publication, and the content stream carries bounded history and immutable content operations with explicit completion.

The transport adapter should own WebTransport stream lifecycle, framing, timeouts, cancellation, and flow control.
The server sequencer should own authoritative ordering, writer sessions, reference validation, minimum-reference tracking, and rejection.
Client-side sequencing logic should track pending local operations, rebase them over received operations, and resolve ambiguous submissions; it must not independently assign authoritative order.

## Client opens and edits a document lazily

Client creates (or already has) a WebTransport connection.

The client creates the **event subscription stream** using `createBidirectionalStream()` and sends a request to connect to an event stream.
This request includes:
- the document identifier;
- an optional required event position, used when a restoring client must observe enough history to rebase pending local operations; and
- a versioned blob-loading hint.
	Unknown hint versions must be safe to ignore.

The initial loading hint can be `lazy`, with no data beyond its identifier.
Future optional hints could request eager loading of all snapshot blobs, summarize the client's cache with a Bloom filter, set size thresholds, or select paths through the blob tree.
Hints are performance advice, not correctness inputs.

The server responds with a **snapshot load** message containing:

- the selected snapshot; and
- a unique session identifier that can later authorize an event author stream.

If the request contains a required event position, the server selects the newest retained snapshot at or before that position.
Otherwise it selects the newest snapshot.
The load message is immediately followed by every event after that snapshot.
Snapshot selection and event delivery must form one gap-free load operation, although the events are separate messages.

The proposed snapshot representation is a content-addressed root digest plus a heuristically selected set of eagerly included blobs.
Eager blobs only reduce round trips: the client uses them to prepopulate its cache and can fetch omitted content by digest.

After delivering all events that existed at the load boundary, the server sends a **caught up** marker.
New events can continue on the same stream.

If a caught-up client has pending local edits, it creates a second WebTransport bidirectional stream called the **event author stream**.
Its initialization message contains the document identifier and the session identifier issued for the paired event subscription stream.
The protocol must define takeover and reconnect behavior when an author stream already uses that session.

The reference event stream position is tracked (newest sequenced position known about when the edit was authored (or last rebased)), and if different from the previous event, included before the event.

The server side sequencer needs to ensure events in the stream clearly communicate their reference sequence number, and session id.
To avoid overhead in bursts of ops from a single client this can be done simply be inserting an event whenever the session id for the next event changes, and one with the reference sequence number whenever the event has a different reference sequence number from the previous message from that client.

The server-side sequencer must define a minimum allowed reference position.
Messages with older references are rejected, and the author stream may be closed.

Wire-visible join and leave events may not be required, but the sequencer still needs an authoritative writer lifecycle.
Disconnect, reconnect grace, session replacement, inactivity expiry, and lag eviction must update membership in a way that survives replay; otherwise an abandoned writer can hold the minimum reference indefinitely.
TODO: Settle on a clearer approach here.

When a client with an active author connection updates the reference position used by future events, it must advance rather than regress.
The server can evict writers that fall behind or remain inactive according to explicit policy.

### Snapshotting

A client can subscribe to snapshots using a request shaped similarly to the event subscription request, with a distinct message type.
The event position supplied to the event subscription already provides the position-based resume behavior needed by a reconnecting client, so the snapshot subscription does not need a separate resume cursor.

When the snapshot subscription opens, the server sends the latest snapshot.
It then sends newly published snapshots until the stream is closed.

Snapshot notifications have latest-value semantics by default.
If the client is backlogged, the server may coalesce pending notifications and send only the newest available snapshot because a newer snapshot supersedes the skipped snapshots for loading purposes.
The protocol must document that subscribers are not guaranteed to observe every snapshot publication.
A future subscription option may request delivery of every snapshot, with its required buffering, backpressure, and retention behavior defined separately.

### Blobs

The storage contract, retention model, hard-link implementation, and Fluid mapping are specified in [BLOB_STORAGE.md](BLOB_STORAGE.md).
This section focuses on the proposed network flow.

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
