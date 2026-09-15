# Content-addressed blob storage

This document proposes a unified content-addressed storage contract for binary blobs, directory blobs, Fluid summaries, and content referenced by events.
It describes a target architecture rather than the behavior of the current `snapshotted-stream-content-addressed` crate.

The design separates correctness requirements from backend mechanisms.
An in-memory implementation can maintain explicit reference counts, while a local-filesystem implementation can use hard links and inode link counts for most reference tracking and garbage collection.

## Goals

- Store each immutable value once under a digest of its canonical content.
- Reuse unchanged content across snapshots, events, and documents without uploading or copying it again.
- Represent directory structure as immutable content so unchanged subtrees retain the same digest.
- Unify Fluid attachment blobs and summary blobs under one storage and retrieval contract.
- Keep pending uploads alive long enough to be referenced asynchronously without retaining abandoned uploads forever.
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

## Backend-independent implementation model

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

The current minimal Fluid driver does not yet implement this recursive representation.
It uploads summary leaves as blobs, flattens their paths into one summary manifest, rejects summary handles and attachments, and publishes that manifest digest as an opaque snapshot payload.
Moving to first-class directory objects would preserve subtree identity, allow handles to reuse unchanged data directly, and avoid rebuilding a flat manifest when only one subtree changes.

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
