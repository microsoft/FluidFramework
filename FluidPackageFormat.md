# Fluid Package Format and Collaboration Establishment (Proposal)

> **Status:** Draft / exploratory.

An agentic harness should be able to create a Fluid file without running Fluid: write ordinary application files into a `.fluid` ZIP, then let a capable application establish collaboration.
The same format should support non-Fluid readers and editors, sensitivity-label protection, and lossless export/import when collaborative state is preserved.

This proposal defines that interchange format and the collaboration-establishment flow for OneDrive and SharePoint (ODSP).
The format is service-independent; it does not replace the live summary/snapshot protocol or specify ODSP's internal storage.
Document-only creation is the first rollout; full collaborative round-trip support follows.

## Proposal

### 1. Package layout and manifest

The ZIP has fixed top-level names:

```text
container.fluid
├── manifest.json             Envelope version and file-level protection metadata
├── document/                 Ordinary, application-defined files
│   ├── index.html
│   └── media/cover.png
└── .collab/                  Opaque collaborative state
    ├── integrity.json        Internal checksum record; excluded from its own hash
    ├── tree.json             Logical tree, node metadata, and blob references
    ├── .ops/                 Operations needed after the selected summary
    └── .blobs/               Content-addressed blob bytes
```

`document/` and `.collab/` can each be omitted, but at least one usable representation must remain.
The layout inside `.collab` is illustrative, not a public wire-format specification.
Non-Fluid tools only need to understand `document/`; they can preserve `.collab` untouched or discard it.

**Keep `manifest.json` small.**
It contains the envelope version (`packageFormatVersion`) and, when applicable, sensitivity-label information.

**For document-only files, the manifest and all its fields are optional.**
An omitted version means version 1; omitted sensitivity-label information means the file is unlabeled.
A harness can therefore create a ZIP containing only `document/index.html` and its assets.
A package containing `.collab` must include the manifest and its version.
Malformed metadata or an unsupported version is not equivalent to omission.

**Portable metadata, not service state.**
The [ODSP label contract](packages/drivers/odsp-driver-definitions/src/sessionProvider.ts) exposes `sensitivityLabelId`, `tenantId`, and `assignmentMethod`.
Microsoft's [label metadata documentation](https://learn.microsoft.com/en-us/information-protection/develop/concept-mip-metadata) confirms that label identity, tenant, and labeling/protection information can be embedded in files.
The exact `.fluid` serialization and protection integration remain to be agreed; copying a service response is not an established file format.
No additional ODSP-specific embedded metadata has been established by the repository.
[Drive/item IDs, ETags, sharing permissions, and service modification metadata](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0) are service properties, not fields to copy into this manifest.
Epoch likewise remains service-owned.

Labels and protection must work from initial creation through export, import, and collaboration, without an unprotected intermediate file.

An application-owned `document/manifest.json`, if present, is unrelated to the envelope manifest.

### 2. Application content: `document/`

`document/` contains an application-defined, **importable** representation: HTML, images, or another supported application format.
It is not merely a preview; every supported format needs an application-supported path into collaborative state.
Tools may author it directly without a prior summary or `.collab`.

Its files must be self-contained, with ordinary names and bytes and **no references into `.collab`**.
Export materializes shared assets here, even when that duplicates bytes stored under `.collab/.blobs`.
Live summaries and service storage need not duplicate those bytes.
File extensions are hints; this proposal does not add media types to `uploadBlob()`.

While `.collab` is valid, it is authoritative and `document/` is a derived representation.
Without valid `.collab`, the application imports `document/` as fresh collaborative state.
That conversion may lose detail or history not represented in the application files; it need not preserve old collaborative identities.
Use a Fluid client for edits that must merge with an active session, rather than replacing the file externally.

Independent reads of `document/` should not require downloading collaboration blobs or establishing collaboration.
Service-native rendering and selection of subsets such as text without images are separate capabilities.

### 3. Collaborative state and export

`.collab` preserves the selected summary's `.protocol` and `.app` state, the required operation tail, and all referenced payloads.
Its internal representation must retain logical names, node metadata such as `groupId` and `unreferenced`, binary bytes, and runtime-visible identities.
Summary and snapshot objects are different schemas and need explicit conversion.

An export fixes and records two sequence numbers: the summary state **S** and the export endpoint **E**.
`.collab/.ops` contains every sequenced operation in **(S, E]**, in order.
The tail may be omitted only when **S = E**.
Export resolves incremental summary handles, fetches omitted loading groups, and includes attachments referenced by either the summary or the tail.
Unsequenced local changes are outside this contract.
Additional historical retention, such as 30 days of operations, is a separate proposal, not a guarantee that offline clients can resume.

Blob content IDs encode content and a recoverable summary/attachment type; their exact encoding remains open.
They are not assumed to equal opaque ODSP blob IDs.
Identity preservation must cover references in BlobManager redirect tables, serialized distributed data structure (DDS) handles, and operation metadata, not just `tree.json`.
The aliasing or migration mechanism remains open and is required for full `.collab` round-trip support, not document-only creation.

Importing preserved `.collab` is intended to retain ODSP's existing import/restore semantics for initializing collaboration.
Those service mechanics remain outside scope.

### 4. Generating `document/` during summarization

For an existing collaborative file, the application supplies the document representation using ordinary summary objects.
The preferred contribution point is `.app/document`, with a `groupId` for loading control.
Already-uploaded assets can be referenced through `ISummaryAttachment`; unchanged summary content can reuse `ISummaryHandle`.
Asset bytes become ordinary files when exported, not duplicate inline blobs merely because they appear in the document representation.

This contribution point needs runtime integration; it is not an existing stock application API.
The provider API and invocation policy remain open, with these requirements:

- **Correct dependencies:** changes in any source data store must invalidate the generated document, even when incremental summarization would otherwise reuse a handle and skip the provider.
- **Safe generation:** asynchronous live-summary work must not mutate the model or wait for operations while inbound processing is paused. Initial/detached summaries are synchronous, so asynchronous preparation happens beforehand.
- **Explicit loading:** `groupId` alone does not integrate an arbitrary subtree with runtime fetching or guarantee omission from the initial snapshot.

Export separates the document contribution after resolving handles.
If a service requires a different live tree layout, an adapter must translate incremental handle paths and reconstruct the runtime's expected snapshot shape and metadata.
Summary handles are paths into prior summaries, not content hashes.
Changing the package layout alone does not require changing live storage.

**Freshness is separate from byte integrity.**
A generated document represents its source summary, not necessarily later operations in `.collab/.ops`.
Application metadata can identify that source state; a revision ID alone does not supply the history needed to compute a diff.
When to generate a final summary or refresh an idle file is outside scope.
Today's summary flow needs a connected summarizer; offline summary publication would need additional capability.

### 5. Integrity and external edits

Store the collaboration checksum and the expected `document/` checksum in **`.collab/integrity.json`**.
The collaboration checksum covers entry paths and bytes for everything else in `.collab`, including the tree, blobs, and operations.
It **excludes `integrity.json` itself**, avoiding recursion.
The document checksum covers its paths and bytes, with a distinct value for an absent `document/`.
Algorithm, encoding, and canonicalization are internal details still to be specified.

The record associates collaborative state with the document present when that state was established or summarized.
On external upload, compare against the recorded document checksum **before** replacing it with a newly computed value.
Missing or malformed integrity information makes `.collab` unusable.

| File state | Result |
|---|---|
| Both checksums match | Use otherwise-valid `.collab`; this includes a document recorded as absent and still absent. |
| Document changed or added | Discard stale `.collab` and establish from the current document. |
| `.collab` absent or damaged, document available | Establish from the document. |
| Previously recorded document deleted | Invalid file; do not silently resume the old `.collab`. |
| Neither usable `.collab` nor an importable document | Error; there is no recovery source. |

These checks detect incidental modification, not authenticity, correct rendering, or freshness relative to later operations.
They are not authorization or sensitivity-label protection.

**With no `.collab`, no checksum record is needed: every write is a file overwrite.**
With `.collab`, SharePoint Online (SPO) may recognize an unchanged re-upload as a no-op.
Logical-content comparison is preferred, but treating any archive-byte change as an overwrite is acceptable.
Any no-op decision must include operations and meaningful protection metadata and must not discard an intervening edit.

### 6. Establishing collaboration

The same flow handles a newly created document-only file and recovery after an external edit:

1. **Read:** extend `getLatest` to return either valid collaborative state or a document-only response with an opaque file ETag/generation token bound to the returned state. Return an error if neither representation is usable.
2. **Import:** the calling application may read without establishing collaboration, or import the document and prepare an initial summary. Any protocol-capable application with the file's required read/write permissions may submit it; no exclusive application identity or importer-discovery mechanism is required.
3. **Commit conditionally:** the service atomically checks both the generation token and that the file still requires establishment, then commits the summary. The resulting package includes the required versioned manifest. Only one competing importer wins; intervening edits or replacements reject stale imports.
4. **Resume:** collaborative APIs become available. After a conflict, obtain fresh state, bypassing stale document-only cache entries; if another client established `.collab`, use that state instead.

Establishment must preserve epoch and the file's last-writer identity/timestamp.
It does not revive clients invalidated by an earlier replacement.
Until establishment, other collaborative APIs must report a distinguishable establishment-required state.
Epoch mismatch alone is not that signal: a fresh client accepts the current epoch.
Driver, loader, connection ordering, cache, and error handling need to support the new response rather than treating it as a normal snapshot.

These are proposed service guarantees.
[`createNewContainerOnExistingFile`](packages/drivers/odsp-driver/src/createFile/createNewContainerOnExistingFile.ts) already forwards an ETag through `If-Match`, but generation binding and atomic first-establishment semantics need confirmation.
A missing summary parent alone is not a generation precondition.
Retry after an unknown commit outcome also remains to be specified.

### 7. Assets and rollout

**Primary bootstrap:** include imported asset bytes as ordinary summary blobs under the runtime's grouped `.app/.blobs` subtree.
The existing-file ODSP converter carries inline blobs and tree `groupId` metadata, but does not accept attachment entries.
Today's BlobManager instead emits attachment references and redirect tables.
Runtime support must cover creation, loading, handle resolution, subsequent summaries, and garbage collection; adding the tag alone is insufficient.
Confirm applicable summary-size limits.

**Required, but much lower priority:** let an initial summary reference assets already in the file's `document/`, avoiding re-upload.
This needs SPO support, not ordinary summary handles.
References must bind to the same file generation, acquire usable runtime identities, and retain their bytes independently of later document regeneration.
The protocol remains open.
Separate attachment staging is not the selected design.

Neither path requires eliminating `ISummaryAttachment` across Fluid.
The broader attachment/loading-group unification is a separate future direction.
Package duplication does not prescribe ODSP's physical storage or establish zero additional storage cost.

**Deployment sequence:** first deploy clients that put `groupId` on `.app/.blobs` and support inline content as well as existing attachment references.
Enable document-first creation per application only after those versions have saturated participating clients, **including summarizers**.
This needs no separate package compatibility gate and introduces no application-identity restriction on establishment.

Before enablement, demonstrate:

| Scenario | Required outcome |
|---|---|
| Creation and reads | A harness creates a document-only ZIP without a manifest or previous summary. Reads return the document and generation token without establishing collaboration; omission defaults apply. |
| Assets and collaboration | Import binary assets, establish, edit with multiple clients, summarize, and reopen with expected state and unchanged asset bytes. |
| Protection | Labeled files stay protected through creation, reads, establishment, and reopening, with no unprotected intermediate file and normal read/write authorization. |
| Competing importers | One wins; the loser refreshes and adopts the winner's state. Epoch and last-writer metadata are preserved. |
| Intervening replacement | A stale import fails without replacing newer content or reviving old collaborative sessions. |
| Application rollout | Enablement waits for client and summarizer saturation. |

Full preserved-`.collab` round trips, references to existing document assets, and broader attachment/group unification remain separate milestones.
The initial rollout must leave room for them.

### 8. Remaining design work

The main open contracts are:

- Sensitivity-label serialization and end-to-end protection integration; any additional confirmed portable ODSP file metadata.
- Internal collaboration schema, typed blob identities, operation encoding/boundaries, and checksum encoding.
- Establishment generation/transaction guarantees, errors, caches, and unknown-outcome retries.
- Document-provider API, dependency invalidation, loading integration, and any live-layout adapter.
- Grouped inline-asset runtime support and limits; later, SPO references to existing document assets.

## Appendix: summary, operations, and exported files

This example is schematic, not a wire schema.
It omits routine runtime/DDS metadata and channel wrappers.
The proposed document contribution references the **same uploaded image** as the collaborative model; neither reference embeds another copy of the PNG.

### Summary at S = 100

```text
SummaryTree
├── .protocol/
│   └── attributes             ISummaryBlob: sequenceNumber = 100, ...
└── .app/
    ├── .channels/
    │   └── store-1/
    │       └── content/header ISummaryBlob: model including a cover-image handle
    ├── .blobs/
    │   ├── 0                  ISummaryAttachment: id = "storage-cover"
    │   └── .redirectTable     ISummaryBlob: runtime blob-ID mappings
    └── document/              Proposed ISummaryTree, groupId = "document"
        ├── index.html         ISummaryBlob: HTML referring to cover.png
        └── cover.png          ISummaryAttachment: id = "storage-cover"
```

Operations are **not part of the summary**.
For an export endpoint E = 102, the exporter also captures sequenced operations 101 and 102 and any payloads they reference.

### Exported package at E = 102

```text
container.fluid
├── manifest.json              { "packageFormatVersion": 1 }
├── document/
│   ├── index.html             Ordinary HTML from the document contribution
│   └── cover.png              Materialized PNG bytes
└── .collab/
    ├── integrity.json         Collaboration/document checksums; not self-hashed
    ├── tree.json              Collaboration tree, metadata, and typed blob IDs
    ├── .ops/
    │   └── segment-0001       Operations 101 and 102; boundaries S = 100, E = 102
    └── .blobs/
        ├── <summary-ids>      Protocol, model, redirect-table, and other state
        ├── <attachment-id>    Cover PNG bytes referenced by collaborative state
        └── <op-payload-ids>   Any additional blobs referenced by the operation tail
```

Segment names and IDs are illustrative; runtime identity mapping is omitted.
The PNG is duplicated **in the interchange package**: once as `document/cover.png`, once in the collaboration blob pool.
The live summary above only references it.
Here `document/` reflects S = 100; replaying `.collab/.ops` reaches E = 102.
