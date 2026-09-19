# Blob-tree Storage

Sea implements a unified content-addressed contract for binary blobs, immutable directories, snapshots, and content referenced by events.
`sea-core` owns typed identities, storage components composed by `SeaView`, and the higher-level session contracts.
The view establishes tree availability before appending an event and both tree and event availability before publishing a snapshot.
Backends preserve dependency-closed committed history on recovery; raw event components keep tree identities opaque rather than implementing cross-component validation themselves.

The initial implementation retains every uploaded and referenced object.
The garbage-collection and hard-link material below describes a future compatible lifetime design, not behavior required from the current backends.

The design separates correctness requirements from backend mechanisms.
An in-memory implementation can maintain explicit reference counts, while a local-filesystem implementation can use hard links and inode link counts for most reference tracking and garbage collection.

## Goals

- Store each immutable value once under a digest of its canonical content.
- Reuse unchanged content across snapshots, events, and documents without uploading or copying it again.
- Represent directory structure as immutable content so unchanged subtrees retain the same digest.
- Unify Fluid attachment blobs and summary blobs under one storage and retrieval contract.
- Keep pending uploads available for later asynchronous reference; the initial implementation retains them indefinitely.
- Retain every object reachable from a live event or snapshot and reclaim objects that have no live references.
- Permit backend-specific deduplication and garbage collection without exposing filesystem paths or reference counts to clients.

## Motivation

Fluid summaries frequently preserve most of the preceding summary and change only a small subset of leaves or subtrees.
A content-addressed representation lets a new summary refer to the existing digests for every unchanged object and upload only changed content.

The same reuse applies outside summaries.
An attachment, an event payload dependency, and a summary leaf containing identical bytes can share one immutable binary object.
Two directory objects with identical names and child digests can share one immutable directory object.
Cross-document reuse can avoid physical duplication when authorization policy permits it, without making cross-document reachability part of the public identity.

Content reuse is an optimization, not a correctness dependency.
Losing a cache name or creating two physical copies of the same digest may waste space, but readers must still receive the bytes identified by that digest.

## User-facing contract

### Objects

The content graph contains two object kinds:

1. A **binary object** contains an opaque byte string.
2. A **directory object** contains a canonical immutable map from entry names to typed child digests.

The digest commits to the object kind and canonical encoding as well as its content.
Domain separation prevents the same bytes from ambiguously identifying a binary object and a directory object.
Directory entry names, ordering, duplicate handling, and allowed child kinds must have one canonical encoding.

Objects are immutable.
Publishing the same object more than once returns the same digest and may reuse an existing physical object.
A successful read verifies that the returned object matches the requested digest.

### Publication and reuse

A client can upload an object without immediately attaching it to a document.
The service returns its digest after validating and publishing the canonical content according to the backend's advertised durability.

A client that already knows a digest can reuse it without uploading unchanged data again.
Before committing a reference, the service verifies that the named object and its required reachable closure are available.
Missing content causes a definitive rejection before the event or snapshot commits, allowing the client to upload the missing objects and retry under the operation's normal identity rules.

The protocol may offer an existence or upload-negotiation operation, but authorization must prevent it from becoming a cross-document content-discovery oracle.
Bloom filters and similar cache summaries are hints that reduce transfers; false positives can cause an omitted eager transfer but cannot make content inaccessible through an authorized fetch.

### References and retention roots

Content becomes live through an explicit retention root.
Initial root kinds include:

- a pending upload owned by a connection, session, or expiring upload lease;
- content declared by a retained event;
- the root directory object of a retained snapshot; and
- any additional application root represented by a future protocol extension.

A root retains its complete transitive closure, not only its immediate object.
Removing one root must not remove objects still reachable from another root.

The service must establish all content references before acknowledging the event or snapshot that owns them.
It must release those references only after the corresponding event, snapshot, or pending-upload lease is no longer retained.
Retention policy determines when roots may be removed; the content store only implements the resulting liveness decisions.

### Retrieval and authorization

Digests are global content identities, but knowledge of a digest does not necessarily grant access to it.
Each fetch carries authorization context from which the service can prove that the caller may access at least one live root reaching the requested object.

The service may return a requested object, a bounded portion of its reachable graph, or eagerly selected related objects.
Every returned object is independently identified and verifiable by digest.
Truncation, ordering, deduplication, and eager loading affect performance only.

### Transformations

Compression and encryption require an explicit digest domain.
The protocol must define whether a digest identifies canonical plaintext, transformed bytes, or a canonical authenticated envelope.
That choice controls deduplication, key rotation, server-side reference validation, and whether eagerly returned objects are directly usable by a client.

Storage-record wrappers cannot be assumed to apply correctly to content objects.
Record transformation, content transformation, and transport encoding are separate composition boundaries.

## Optimizations

This section is the source of truth for blob-transfer optimization status and implementation handoff context.
Statuses describe the current source, not fresh performance measurements: **Implemented** means the mechanism exists, **Partial** identifies a remaining limitation, and **Proposed** means it is not implemented.
Proposals are independent opportunities, not commitments to implement every feature or prerequisites for the initial optimization work.
Update the table and its supporting details when behavior changes.

### Status

| Optimization | Status | Scope and remaining work |
| --- | --- | --- |
| Persistent content stream | Implemented | Unary content operations reuse a stream, avoiding stream creation per object; requests remain serialized. |
| Backpressure-driven blob production | Partial | WebTransport and native `WebSocketStream` provide transport backpressure; proposed recursive and concurrent blob work must preserve it through bounded traversal, reads, transforms, and queues. Ordinary WebSocket lacks receive backpressure. |
| Content-addressed deduplication | Implemented | Backends reuse immutable identities within their storage scope. This does not by itself avoid transferring duplicate upload bytes or establish cross-document availability. |
| Reuse through Fluid handles and attachments | Implemented | Existing blob identities avoid reuploading unchanged leaves. Directory reconstruction still incurs avoidable requests. |
| Bounded parallel summary uploads | Partial | The Fluid adapter admits up to eight blob uploads per summary, but the remote client's content-stream mutex serializes complete request/response operations. |
| Multiple in-flight content requests | Proposed | Pipeline requests and correlate responses end to end; the existing correlation envelope alone does not provide concurrency. |
| Parallel or batched downloads | Proposed | Fluid directory traversal and full-summary blob downloads are sequential. A bounded pool helps independent objects, but not undiscovered dependencies. |
| Targeted incremental-summary traversal | Proposed | Resolve only needed handle paths, preserve directory handles directly, and publish newly composed ancestors; see [Mapping to Fluid](#mapping-to-fluid). |
| Lazy blob-body downloads | Implemented | Snapshot-tree reconstruction reads directories without downloading all blob bodies; applications can request leaves separately. |
| Client content cache and duplicate-fetch coalescing | Proposed | The Fluid adapter exposes cache-policy metadata but has no internal blob cache or shared in-flight fetch registry in its current client path. |
| Per-blob compression | Implemented, optional | The session decorator compresses whole leaves; it does not provide streaming compression or a decoded-size bound. |
| Digest-first upload negotiation | Proposed | Avoid sending bytes the service already has; ordinary `putBlob` currently sends the whole payload. Requires scoped availability checks and privacy policy. |
| Explicit cache summaries | Proposed | Digest lists or Bloom filters suppress likely redundant speculative transfers; false positives must remain recoverable. |
| Coarse cache assumptions | Proposed | Assume everything except the explicitly requested object, or nothing, is cached; a cheap alternative to detailed summaries. |
| Transfer-history inference | Proposed | Keep a bounded, possibly approximate record of what the peer previously held, including avoiding reupload of downloaded objects. |
| Recursive speculative download | Proposed | Traverse from a requested digest and send descendants without waiting for a client request at each directory. |
| Demand-selection hints | Proposed | Shallow/deep or directory-only traversal, depth limits, path inclusion/exclusion patterns, and small-object thresholds select content wanted now. |
| Eager content during initial load | Proposed | Put the same versioned hint on `OpenEventStream` so selected snapshot content can arrive without a separate content request. |
| Heuristic speculative budgets | Proposed initial approach | Use byte, object-count, and traversal-work limits without requiring latency measurements. |
| Latency-aware speculative sizing | Proposed later refinement | Adapt to round-trip time, effective throughput, and queued useful work; not a prerequisite for heuristic budgets. |
| Chunked, resumable, or range transfers | Proposed | APIs currently buffer whole blobs; remote frames default to 4 MiB including protocol overhead. These features require separate framing and integrity decisions. |

### Implementation entry points

- [Fluid storage adapter](packages/sea-driver/src/storage.ts): `uploadBlobs`, `flattenSummary`, `downloadSummary`, and `readBlob` own upload admission, handle reuse, full-summary retrieval, and cache-policy metadata.
- [Fluid session client](packages/sea-driver/src/sessionClient.ts): `uploadBlob`, `fetchBlob`, `publishDirectory`, and `flattenDirectory` bridge the adapter to neutral sessions and currently traverse directories sequentially.
- [Shared native/browser session client](crates/sea-webtransport/src/native.rs): `SessionClient::content_request` holds the content-stream mutex across the response; `put_blob` and `get_blob` transfer whole payloads.
- [Wire protocol](crates/sea-webtransport/src/protocol.rs) and [server dispatch](crates/sea-webtransport-server/src/dispatch.rs): own message shapes, correlation, completion, and routing. Use the [transport guide](crates/sea-webtransport/README.md) for stream ownership and cancellation contracts.
- [Blob storage contract](crates/sea-core/src/storage/blob_store.rs) and [session contract](crates/sea-core/src/session.rs): own immutable content and availability semantics; transfer hints must not weaken them.
- [Compression](crates/sea-compression/README.md) and [encryption](crates/sea-encryption/README.md): own payload transforms. Current identities name encoded stored bytes, including ciphertext when encryption is enabled; directories remain visible.

### Cache knowledge, demand, and budgets

These are separate inputs to a transfer decision and should remain separately interpretable even if encoded in one versioned hint.
They can apply to initial open/load and subsequent content requests.

**Cache knowledge** estimates what the receiver already has.
It can be explicit (digest lists or Bloom filters), coarse (assume everything or nothing is cached), or inferred from prior uploads and downloads.
An explicit request for an object overrides approximate cache knowledge; a false positive must never prevent an authorized fetch.
Define the scope, memory bound, and invalidation rules for inferred knowledge across reconnects, document changes, client eviction, and service retention changes.

The service's directory-availability guarantee includes all descendants; a client's cached directory does not imply cached descendants.
Knowing that the client has a directory can avoid sending that directory again, but must not automatically prevent traversing it to find wanted descendants.
A client that has held a directory for some time may have requested those descendants already; recently delivered directories may not have allowed time for a round trip, and application demand can change.
Long service retention makes assuming that the service still has previously available content a useful upload heuristic, not proof of continued availability in the relevant document scope.
Reference publication must still verify availability, with missing-content recovery following the operation's normal rejection and identity rules rather than blind retry.

**Demand** describes what the receiver wants now, independently of what it has.
Shallow/deep traversal can resemble the transfer behavior of extreme cache assumptions, but shallow means "do not send descendants now," not "I have the descendants."
Path inclusion and exclusion patterns can request most of a document while leaving large optional subtrees for later loading.
Before implementation, define pattern syntax, matching against canonical directory paths, exclusion precedence, and whether traversal may pass through unselected ancestors to reach selected descendants.
Shared subtrees may occur at multiple paths: path selection must not be lost by deduplicating traversal solely by digest before evaluating demand.

**Budgets** bound transferred bytes, object count, and traversal work, including work that produces no bytes because content is cached or excluded.
Initial budgets can use simple heuristic sizes without explicit latency knowledge.
Their purpose is to keep the connection occupied with mostly useful data while further requests arrive, not to maximize batch size.
A mostly useful batch taking two round trips to transmit can support pipelined requests; adding lower-confidence data beyond that can waste resources and delay wanted content.
As a separate future improvement, use measured round-trip time, effective throughput, and already queued useful work to size speculation around discovery latency.
There is no universal one-round-trip batch limit; the relevant question is whether additional speculative work fills otherwise idle time or displaces more useful work.
Both approaches need hard resource limits, backpressure, cancellation, and priority for explicitly requested content over lower-confidence speculation.

### Backpressure and bounded production

Use the existing WebTransport and native `WebSocketStream` backpressure to pace blob production instead of eagerly materializing a recursive result or launching all uploads and downloads at once.
Await transport writes and use bounded, byte-accounted queues between traversal, storage reads, compression/encryption, encoding, and transmission.
When downstream capacity is exhausted, stop admitting more work upstream; allow only bounded lookahead to overlap storage or transformation work with transmission.
On receive, avoid draining the transport into an unbounded response queue or cache, which would defeat backpressure from the consumer.
Cancellation must stop traversal and release queued work, not merely discard results after production finishes.

Backpressure controls production rate and outstanding buffering, not how much speculative content is useful.
It complements rather than replaces per-request speculation budgets, demand hints, and hard traversal limits: a fast receiver could otherwise accept an arbitrarily large amount of unwanted content.
Use it from the initial heuristic-budget implementation without requiring explicit latency measurements; latency-aware sizing remains a separate possible refinement.
An awaited write indicates transport progress or acceptance into buffering, not remote application consumption, cache retention, or storage acknowledgement.
Runtime, network, and proxy buffers can delay the pressure signal, so retain explicit bounds on application-owned work.

Prefer small bounded queues and schedule explicit requests ahead of lower-confidence speculation before bytes enter a transport's ordered send queue.
Already queued speculative bytes cannot generally be reprioritized; large writes can delay more useful responses on the same stream.
Separate logical streams still share connection and host resources, so enforce aggregate byte and work limits and test event-delivery fairness.
Current blob APIs and transforms buffer whole payloads: backpressure can bound the number and total bytes of admitted objects, but does not itself provide streaming within a blob or bound decompressed size.

Ordinary WebSocket fallback cannot propagate receive backpressure when the application stops reading.
Its send-buffer admission throttling and bounded receive queues do not provide the same guarantee; queue overflow fails the transport rather than silently dropping content.
Use conservative bounded production for that mode, and define application-level receive credits or another explicit pacing mechanism if future speculative transfers need stronger slow-consumer guarantees.
Do not assume that per-socket queue limits bound connection-wide, runtime, or proxy memory; see the [transport limitations](crates/sea-webtransport/README.md#optional-websocketstream-fallback).

### Recursive fetch and initial load

For a linked chain of tiny directories, independent-request concurrency cannot avoid the discovery dependency: each reply reveals the next digest.
Server-side traversal can instead send several descendants before another client round trip.
This requires the client to accept, verify, and retain eagerly supplied objects so later reads can use them without fetching them again.

The initial event open/load request (`OpenEventStream`) should accept the same versioned loading hint as a content request.
The server can then send selected directories and blobs reachable from the selected snapshot root without waiting for a separate content request or stream-opening exchange.
Hints must not change snapshot selection or the gap-free event suffix.
Absent or unknown hint versions must permit ordinary lazy loading; wire encoding must allow unknown hints to be skipped safely.

Define how eager content is framed, correlated, and completed during load, whether it shares the event stream or uses another delivery mechanism, and how scheduling avoids delaying catch-up and live events behind speculative bytes.
Content completion is distinct from event catch-up; neither implies that every reachable blob has been delivered.
Every supplied object needs its typed digest and verifiable bytes in the current transformation domain.
Partial-object delivery, if later added, needs explicit reassembly and integrity semantics rather than treating fragments as published objects.

For subsequent recursive requests, responses may interleave objects from multiple request identifiers and may deduplicate, throttle, or truncate results within the negotiated bounds.
Send an explicit end-of-request indication when no more objects will be sent, and do not reuse an identifier while its request is active.
Define completion, truncation, error, and cancellation semantics so omitted descendants remain discoverable and fetchable by digest.
Return at least one useful object for a truncated request when possible; otherwise report a defined outcome, such as an oversized requested object, rather than permitting an empty retry loop.
Deduplication across requests must not leave a requester waiting for content whose delivery was cancelled with another request.

### Correctness and security boundaries

Hints affect transfer scheduling only; they do not grant access, establish availability handles, change publication order, or prove retention.
Current remote sessions are document-bound, and the built-in host does not implement production authentication or tenant policy.
Do not make a content stream document-independent merely to optimize transfers without defining per-request authority and checking every returned object's authorization.
Existence probes, cache summaries, and inferred knowledge must not become cross-document or cross-tenant content-discovery oracles.
A Bloom filter can itself disclose cache membership; define its scope and exposure before using it across trust boundaries.

Cross-document physical deduplication and authorization through a document are separate concerns.
A non-owning document-to-digest reachability index is one possible authorization aid, but its consistency and interaction with retention remain unresolved.
Pending uploads are currently retained indefinitely; expiring upload scopes and retention roots belong to the future lifetime design below and must not be assumed to exist for upload negotiation.
Bound retained client cache state and decompression output as well as network bytes; whole-payload compression and encryption can otherwise hide substantial memory costs.

### Handoff and validation

Start with the smallest independent optimization and update its status only after testing the owning layer and the actual remote path.
An adapter concurrency test does not prove transport overlap, and storage deduplication does not prove fewer transferred bytes.
Before wire changes, settle hint versioning, completion, cancellation, and load scheduling; preserve client/server compatibility through the repository's protocol-version policy.
Follow [Development](DEVELOPMENT.md) for required validation and use existing owning-module, driver, and browser tests where possible.

Acceptance evidence should cover the relevant scenarios:

- Multiple outstanding remote requests actually overlap; responses correlate correctly under interleaving, failure, and cancellation, and work remains bounded.
- Slow or paused receivers propagate backpressure to blob reads, transforms, and traversal after bounded lookahead; resuming makes progress, and cancellation releases queued work. Exercise WebTransport and native `WebSocketStream` separately from ordinary WebSocket's overflow behavior, and check aggregate buffering and event-delivery fairness.
- A deep chain of tiny directories loads with fewer request round trips; a wide graph demonstrates useful concurrency and shared-subtree deduplication.
- Initial-load hints deliver usable snapshot content without a separate request while preserving snapshot selection, gap-free events, and responsiveness.
- Cache false positives, stale inferred knowledge, cached directories with missing descendants, and changed demand still permit explicit fetch and correct publication rejection/recovery.
- Path exclusions leave optional subtrees unloaded; shared subtrees reached through included and excluded paths retain correct selection semantics.
- Budget exhaustion, oversized objects, unknown hints, malformed content, disconnects, and cancellation terminate predictably without unbounded buffering or retry loops.
- Compression/encryption stacks preserve stored identities and decoded content; targeted Fluid handle reuse preserves path projection and expected-parent conflict checks.

Measure load completion time, request count, transferred bytes, duplicate bytes, unused speculative bytes, peak buffering, traversal work, and event-delivery delay.
Compare shallow/deep chains, wide trees, partially warm caches, optional large subtrees, and slow consumers across representative latency and bandwidth conditions.
Do not claim that larger batches are faster without measuring useful work and wasted transfers separately.

## Future retention model

Every backend needs four logical components:

1. An immutable object table keyed by digest.
2. A set of named retention roots.
3. A way to materialize or account for each root's transitive closure.
4. A collector that removes objects with no roots.

### Publishing an object

The backend computes the digest while validating the object's size and canonical encoding.
It publishes the object only if no valid object already occupies that digest.
If the digest already exists, the backend verifies or trusts it according to a documented integrity policy and discards the duplicate upload.

Publication and root creation are separate operations.
An uploaded object initially belongs to a pending-upload root or lease so a collector cannot remove it before a later event or snapshot references it.

### Committing a root

To commit a root, the backend traverses directory objects from the declared root digests and validates every encountered object.
It prepares retention references for the full closure before making the owning event or snapshot visible.
If any object is missing, corrupt, unauthorized, or beyond a configured bound, root creation fails without committing the owner.

Implementations should bound traversal depth, object count, encoded bytes, and total referenced bytes.
They should reject malformed directory graphs and avoid recursively trusting client-provided structure.

### Releasing a root and collecting objects

When retention policy removes an event, snapshot, or pending lease, the backend releases that root's references.
Collection can then remove physical objects whose reference count contains only the object table's own cache reference, or whose explicit in-memory count is zero.

Collection need not run synchronously with root release.
Delayed collection consumes space but does not change observable content semantics.

### In-memory backend

An in-memory implementation can store one object per digest with an explicit count of live root references.
It can either increment every object in a root's closure or maintain root-to-object sets and derive counts.

Root creation first validates and records the complete closure, then publishes the root atomically under a lock or transaction boundary.
Root deletion removes that root's contribution.
Objects with no pending or committed roots can be deleted immediately or by a later sweep.

The public contract does not require reference counting specifically.
A tracing collector over roots and immutable objects is also valid if it preserves the same liveness behavior.

## Filesystem implementation using hard links

This design assumes that the central object store and all reference namespaces reside on one filesystem that supports hard links, atomic name publication, reliable link counts, and the required file and directory synchronization operations.
Other filesystems need a different implementation of the same contract.

### Layout

One possible layout is:

```text
content/
  objects/
    <digest>                 # canonical cache name for one immutable object file
  pending/
    <lease>/
      <digest>               # hard links owned by one pending-upload lease
  documents/
    <document>/
      events/<position>/
        <digest>             # hard links for the event's reachable closure
      snapshots/<snapshot>/
        <digest>             # hard links for the snapshot's reachable closure
  staging/
    <transaction>/           # unpublished files and reference sets
```

Both binary and directory objects are regular immutable files in `objects/`.
A directory object is a canonical manifest file containing names and typed child digests; it is not a filesystem directory.
Filesystem directories organize retention references, while hard-linked files represent the retained objects.

Each live root has a reference directory containing hard links to every object in its transitive closure.
The baseline design creates one link per object per root.
An implementation may aggregate references, for example one link per document and digest, only if it can update that aggregate without releasing an object still needed by another root.

### Publishing immutable objects

The backend writes an upload to a unique staging file while computing and validating its digest.
It synchronizes the file according to the advertised durability policy and hard-links or renames it to `objects/<digest>` without replacing an existing name.
If the canonical name already exists, the backend verifies that object as required and removes the staging file.

The central name contributes one inode link.
Every pending or committed reference contributes another hard link to the same inode.
The numerical link count is not exposed as a semantic reference count; the collector only relies on whether links beyond the central name exist.

### Atomically establishing references

The backend creates a staging reference directory and hard-links every object in the validated closure into it.
Only after all links succeed does it publish the reference directory and allow the owning event or snapshot to commit.
If link creation reports that a central object disappeared, the operation revalidates or republishes that object and retries; it must not commit a dangling reference.

Crash consistency requires an explicit ordering among object publication, reference-directory publication, owner publication, and synchronization of their parent directories.
The exact ordering depends on whether recovery is allowed to discard an uncommitted reference directory or must reconstruct it from the canonical event log.

### Link-count collection

The collector scans canonical files in `objects/` and considers a file collectible when its link count is exactly one.
That one link is the canonical cache name itself, so no published pending, event, or snapshot reference currently links the inode.
The collector unlinks the canonical name; the inode is reclaimed when its final link and open file descriptions are gone.

This collection does not require a global lock for correctness if all reference creation follows the retry rule above.
The relevant races are:

- If a reference link is created before collection unlinks the canonical name, unlinking removes only the canonical name.
  The reference link remains valid, but future uploads may create another inode for the same digest because the canonical cache name is absent.
- If collection unlinks the canonical name before a reference link is created, the link operation fails.
  Reference creation must revalidate or republish the object and retry before committing its owner.
- If collection observes link count one and a reference is added before the unlink, the unlink may still remove the canonical name.
  The retained reference remains correct; at worst, later publication creates a duplicate physical copy.

These races can reduce deduplication but cannot lose content reachable through a successfully published reference.
The implementation must treat a missing canonical name as a retryable reference-publication race, not as proof that an already linked inode is invalid.

### Cleanup and repair

Startup recovery removes abandoned staging transactions and expires pending-upload namespaces according to policy.
It may restore missing canonical names from retained links to recover deduplication, but correctness does not require that repair.

Integrity checks should verify that every reference filename matches the linked file's digest and canonical encoding.
They should also detect reference directories whose owning event or snapshot is absent and either remove or reconstruct them according to the recovery protocol.

Hard-link limits, inode consumption, directory fan-out, scan cost, and cross-device layouts constrain this design.
Measurements should include link creation latency, root publication latency, garbage-collection scan time, inode usage, and duplication caused by collection races.

## Mapping to Fluid

Fluid currently presents related content through several concepts:

- `createBlob` uploads an attachment-like binary blob and returns an identifier.
- `readBlob` reads a binary blob by identifier.
- `ISummaryTree` represents summary directories, blobs, attachments, and handles.
- `uploadSummaryWithContext` publishes a summary tree, where handles allow unchanged prior content to be reused.
- snapshots expose a tree whose blob identifiers are loaded separately.

The proposed store maps every Fluid summary blob and attachment blob to the same binary-object kind.
Each Fluid summary tree maps to a directory object whose entries identify child binary or directory objects.
The snapshot stores the root directory digest, and a Fluid summary handle reuses the digest of an existing binary object or directory subtree.

This removes the storage-level distinction between a standalone blob and a blob embedded in a summary.
Their content representation, upload, verification, retrieval, deduplication, and physical retention are identical.
They differ only in which Fluid operation creates a retention root and which authorization path permits access.

The minimal Fluid driver implements this recursive representation using Sea blob and directory identities.
It uploads new summary leaves as blobs, accepts attachment nodes that identify previously uploaded blobs, resolves blob and tree handles against the acknowledged parent snapshot, and conditionally publishes the resulting directory root as a new snapshot.
The storage backends validate referenced objects before accepting each directory, and their content-addressed identities deduplicate unchanged blobs and reconstructed directory subtrees.

The driver currently fetches and flattens the complete parent directory before resolving handles, then reconstructs the complete directory structure even when most of the summary is unchanged.
This preserves incremental storage semantics but performs avoidable traversal and idempotent directory requests.
A wire-efficient implementation could instead walk only each handle path from the parent snapshot root, retain tree handles as direct `BlobDirectoryId` values, combine those references with new blobs and attachment `BlobId` values, and write only newly composed ancestor directories.
Existing snapshot, directory read, and directory write operations appear sufficient; no new persisted object kind is required.
Such an optimization must preserve Fluid's `.app` and `.protocol` path projection, validate the requested handle kind, retain expected-parent conflict detection, and measure whether multiple targeted path walks outperform one full parent traversal for realistic summaries.

Fluid's application-level garbage collector and the content store solve different problems.
Fluid GC determines which data stores, attachments, and routes remain semantically reachable in a document.
The content store retains the immutable object closure declared by the resulting events and snapshots.
Because event payloads are opaque to the storage kernel, the Fluid adapter must declare their content roots explicitly rather than expecting the content store to infer references from payload bytes.

## Open questions

- What principal and document context authorize upload negotiation and digest fetches?
- Are pending uploads scoped to a connection, a resumable lease, a document, or a tenant?
- Must every event pin its complete closure independently, or should a document maintain an aggregated reachability set?
- Which snapshot and event retention transitions release roots, and how are those transitions recovered after a crash?
- What bounds prevent adversarial directory depth, fan-out, cycles, or excessive closure expansion?
- Do digests identify plaintext or a canonical encrypted representation?
- Which filesystems and operating systems provide sufficiently reliable hard-link and synchronization behavior for the optimized backend?
