# Example flows

This describes what should go over the network when using the WebTransport adapter (TODO: where is the code for that? DO we call it an adapter? How does this apply to the more general abstraction which the WebTransport adapter needs to implement?) and our fluid-sequencer (how is this divided between the two?). I think we need some sequencing logic on both sides of the connection? How do we layer this?

## Client opens then edits document, lazy

Client creates (or already has) a WebTransport connection.

Client creates the "event subscription" stream using createBidirectionalStream, and sends a request to connect to an event stream.
This request includes:
- which document to load
- optional a position in the event stream which must be included (so old sessions can observe the events they need to rebase over when restoring their pending local events). If provided, load will take place from the newest snapshot which is at or before that position. Otherwise the newest snapshot will be used.
- Blob loading hint. This will have a format version identifier for what kind of hint it is. Unrecognized hints can be safely ignored.
	- Initially we can simply support and always use the "lazy" option which has no data beyond its identifier (Probably a 0 byte).
	- We will eventually want to support an "eager" mode which includes all blobs from the summary, and can be used for apps that will always need all the data before they can do anything when the client has no cached blobs already.
	- We can eventually add a option that includes a bloom filter of blobs the client already has cached and other heuristics like size thresholds, and wildcards for which paths through the tree of blobs to include.

The server responds with a "snapshot load" message, including:
 - the latest snapshot
 - a unique session id (This is only relevant if/when creating an "event author stream", but having it at this point simplifies things)

THis message is followed by immediately followed by all events after that snapshot, but these are not part of the load message.

The format of the snapshot in this message is "blob message" which consists of a content addressable hash for the root blob of the snapshot,
plus a heuristically selected set of blobs to eagerly include.
The heuristically included blobs should only be used reduce round trips: the client can use it to prepopulate its blob cache to save on downloads.

Once the client catches up in the event stream, a message is sent over the stream to indicate the client is caught up.

While a client is caught up (a state it can leave if disconnected or fall too far behind) and there is no active session using its id already based on its read stream (may delay reconnecting until its leave message is sequenced), if there are pending local edits, it should connect as a writer, if not already connected as such.

Connecting as a writer is done by making a second WebTransport BidirectionalStream which we call the "event author stream". An initialization message is sent over this stream document ID (just like for the "event subscription" stream), and the a unique session id from the paired event subscription.

The reference event stream position is tracked (newest sequenced position known about when the edit was authored (or last rebased)), and if different from the previous event, included before the event.

The server side sequencer needs to ensure events in the stream clearly communicate their reference sequence number, and session id. To avoid overhead in bursts of ops from a single client this can be done simply be inserting an event whenever the session id for the next event changes, and one with the reference sequence number whenever the event has a different reference sequence number from the previous message from that client.

The server side sequencer must also ensure there is a clear minimum allowed reference sequence position: any messages with older reference positions must result in the even authoring stream being closed.

Explicit join and leave events are not required. We can simply have events for when the minimum reference position increases.

When a client with an active author connection updates its reference sequence number (which future events would use unless updated again), it must be an increase, and should be send as an event. When the server updates its minimum reference sequence number, it can disconnect writers which have fallen behind as a way to do resource cleanup. It can also close connections which haven't sent anything for too long.

### Snapshotting

A client can subscribe to snapshots, and get a message for each one that occurs. This can be started with roughly the same message used to connect to an event stream (needs a different type so server knows its a snapshot stream)


### Blobs

Blobs can be downloaded by creating a stream, and sending blob download messages (content addressable hash + Blob loading hint + a request id).
The stream will stream back blobs which have been requested, possibly interleaving multiple requests, optionally deduplicating them and/or throttling or truncating them (ex: a request to download all of the blobs in some tree recursively could be truncated after retiring at least one).
Once no more blobs will be sent for a given request, and end request message with the request id is send, and the client should issue more requests if that one's needs are not yet fulfilled.
It is up to the client to avoid reusing the same request id concurrently (which could make interpreting the end request messages messy).

Blob connections do not need to be document specific: any documents accessible over a given WebTransport instance can use the same blob collection.

TODO: there are some interesting security/privacy implications around this. We might need to require a document hint in the request so we can check the blob is reachable from that document first (and that also forces tracking all blobs for a document in one place for fast lookup, which could make blob GC harder if we use hard-links to share them between documents). Maybe a non-owning map of hashes valid to request for a given document would make sense.
1. Ensuring the uploaded blob hint bloom filter is not a privacy issue
2. Ensuring the ability to check if a given blob exists by hash is not a privacy issue.

#### Upload

The async nature needed to support use-cases like the web transport adapter makes this complicated.
The async nature of clients, where they might upload a blob, then reference it some arbitrary time later makes lifetime management messy.

There are two kinds of blobs:
1. Binary blobs
2. Directory blobs

Blobs can be referenced in three ways:
1. In events
2. The root of a snapshot
3. By "directory" blobs, which store a logical `Map<string,blob>`

The server needs to ensure than any directory blob always has all of its children alive as long as its alive,
and any blob referenced by an op or snapshot is retained as well.

For in-memory storage, this can use simple ref counting.
For on disk, we can have a blob sore, with one file per blob, with the hash as the file name.
Directory blobs can be directories, binary blobs files, and snapshots can be hardlinks to their root.

We can also keep a folders of "pending blobs" which might be used by current or future events, or future snapshots.
We could have one such folder for each blob connection (can delete when disconnected): this would name them based on the hash.
And one for each document which could be named by the event position that needs them.
Whenever a snapshot is taken, we could (depending on policy) delete all the blob hard links for ops predating that snapshot.

Additionally whenever we create a blob file, it gets created, its hash validated, then renamed into a central cache by its hash atomically.
We can then hardlink that file into other locations to avoid duplication.

When sending an op adding a blob to a document (as a snapshot or part of an op), the client would first upload the tree of blobs over their blob connection (or at least ensure the server has them with some shortcut, possibly using the same tricks we have for downloading blobs efficiently like a bloom filter and such but driver by the server).

Then they do the operation which references the blob (commit the snapshot or send the op). This must be rejected as invalid if the blob is not actually available by the time the server needs it. The client can retry if needed.

For this to work, we need a way in the protocol to indicate which blobs a given op references. This may be complicated if we try and have a layer that transforms blob contents, like compression or encryption. Thus what ever abstraction we write for dealing with blobs will need to account for this somehow.

## Notes

Positions should probably support `Ord` and be totally ordered.
