# @fluidframework/sea-driver

Use this package to connect a Fluid loader to the Sea service through an injected `SeaDriverClient`.
It implements document services, summary and blob storage, bounded delta storage, and delta connections with explicit disconnect, reconnect, and submission recovery.

## Direct-load content prefetch

`SeaSessionDriverClient` accepts an optional third argument with `loadingHint`, `contentCacheBytes`, and `contentCacheObjects`.
Direct loads send the same hint during remote opening and loading, and consume the selected snapshot's content concurrently with events.
The verified, decoded-content cache serves both summary directories and blob reads.
It retains at most 16 MiB and 1024 objects by default; either limit can be set to zero to disable retention.
Missing or evicted items use explicit `getBlobTrees` requests.
Content-stream errors are surfaced through content reads and event delivery, not hidden by fallback requests.
Disconnect and recovery cancel both streams and clear the cache.
Prefetch is opt-in; the Fluid projection remains separate and unchanged.

```typescript
import {
	SeaSessionDriverClient,
	type SeaSessionFactory,
} from "@fluidframework/sea-driver/internal";

function createDirectClient(openSession: SeaSessionFactory): SeaSessionDriverClient {
	return new SeaSessionDriverClient(openSession, "seaSelected", {
		loadingHint: { includeDescendantBlobs: true, maxExtraItems: 256 },
		contentCacheBytes: 16 * 1024 * 1024,
		contentCacheObjects: 1024,
	});
}
```

Without `loadingHint`, `includeDescendantBlobs` defaults to `false` and `maxExtraItems` defaults to `0`.
The direct editor opts into the example hint; this is not a global driver default.
The factory must preserve opening options, including the hint and event reference.
See the neutral [`load` and `getBlobTrees` examples](../sea-typescript/README.md#loading-and-fetching-content) for the underlying stream API.

### Cache accounting

Both limits apply per driver client and must be nonnegative safe integers.
The byte default is exactly 16,777,216 bytes.
An object is one retained typed blob or directory identity, not an individual directory entry.
Blob accounting includes the identity digest and the decoded payload length.
Directory accounting includes its identity digest, each child identity digest, and the UTF-8 byte length of each child name.
These are retained-content budgets, not total JavaScript heap limits: map keys, object overhead, in-flight responses, and copies returned to callers are not included.
In particular, the byte limit applies after decompression, not to the smaller stored or wire representation.
Decoded blobs are not rehashed against their stored identities.

An item larger than the byte budget is returned to its caller but is not retained.
Insertion evicts the oldest inserted items until both budgets fit.
Cache reads do not refresh insertion order; a repeated content delivery replaces its existing entry and refreshes that entry's insertion order.
The cache uses typed identities, copies retained and returned data, and does not treat duplicate deliveries as stream completion.
Summary traversal batches known directory misses into multi-root requests.
Concurrent content cache misses in the same session are coalesced into batches of at most 16 unique identities.
Duplicate readers share a request but receive independent copies.
The queue admits one content-recovery stream at a time and remains pinned to its original session while admitted reads drain.

### Startup coordination and measurement

`loadDirectSnapshot` calls `load` with the opening event reference and hint, starts the content drain, then reads the first event-stream item.
It returns when the selected snapshot or initial event/progress item is available, not when content prefetch is complete.
It does not issue another snapshot-selection request.
The same event stream continues through catch-up and live delivery while content drains independently.

A cache hit returns immediately after checking for a recorded content failure.
A cache miss waits for the initial content stream to finish, then checks the cache again.
It does not wake early when that particular item arrives.
If the item is still missing, including after normal prefetch truncation or eviction, it issues a `getBlobTrees` request with the configured loading hint.
Directory traversal batches up to 256 identities into one request and consumes its bounded descendant prefetch before continuing.
Only one directory-recovery stream is active per traversal.
Directory traversal and content-recovery queues can run independently.
Requested roots are retained independently of the cache until the batch completes, including when the cache is disabled or too small.
If response limits omit later roots, traversal requests only those still missing.
An empty response or an incorrect first root is an error, not a reason to retry indefinitely.
Measure snapshot availability, content-drain completion, fallback request count, wire bytes, and decoded retained-content bytes separately.
To observe content-drain completion, wrap the neutral factory's returned `load().content.next()` and record its `undefined` result.
Neither `loadDirectSnapshot` completion nor zero extra fetches alone proves that all snapshot descendants are retained.

Content errors reject pending observed reads and remain visible to later content and event reads.
They are not converted into cache misses or hidden by a fallback request.
Disconnect and membership replacement cancel owned event and content streams and clear both cached data and recorded content failures.
Cancelling an old subscription cannot cancel a replacement session's content stream.
Delta disconnection invalidates both delivery pumps before closing either stream.
Reconnect waits for the same outstanding signal and event cleanup, so expected cancellation is not reported as a live synchronization failure.

## Direct incremental summary storage

`SeaDocumentStorage.uploadSummaryTree(summary, baseRoot)` uploads a direct-host summary without publishing it.
Tree and blob handles resolve against the immutable `baseRoot`; this need not be the latest snapshot used as the publication parent.
Handles and paths are validated before uploads start.
The adapter reads only handle ancestors and shares those reads within an upload.
A tree handle reuses its directory ID without traversing or rebuilding its descendants.
New blobs retain the bounded upload worker pool, and explicitly represented directories are composed bottom-up.
`SeaDriverClient.fetchDirectory` and `uploadDirectory` preserve typed child IDs, including empty directories.
The flattened Fluid summary upload path is unchanged.

## Entry Point

All exports are `@internal`; there is no supported public API yet.

The factory implements Fluid's driver-to-loader layer compatibility checks.
Integration testing covers the current client version, not historical-loader conformance.

```typescript
import { SeaDriver, type WasmClientFactory } from "@fluidframework/sea-driver/internal";

export function createDriver(createClient: WasmClientFactory): SeaDriver {
	return new SeaDriver(createClient);
}
```

The injected factory initializes transport and returns a fresh client for each logical Fluid client.
`SeaSessionDriverClient` adapts a neutral `sea-typescript` session supplied by a `SeaSessionFactory`; keep service and compression settings consistent across memberships.
This package has no SharedTree dependency and delegates WebAssembly (WASM) loading to `sea-typescript`.
For hosts that do not use Fluid sequencing, `openDirectSession` bypasses projection and performs no eager history reads.
Its read results use native Sea positions.
`loadDirectSnapshot` consumes the opening snapshot selection and retains the same stream for finite catch-up and live delivery.
Directory traversal uses bounded multi-root requests and cancels each response stream on completion or failure.
The [integration harness](../../tests/sea-integration-tests/README.md) provides local and WebTransport examples through the neutral package entrypoints.

```typescript
import { SeaDriver, SeaSessionDriverClient } from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";

const service = await createMemoryService({ environment: "node" });
const driver = new SeaDriver(async () => new SeaSessionDriverClient(service.open, "clientSelected"));
```

The application owns the memory service lifetime and closes it after its clients are done.
For remote sessions, inject a closure over `openWebTransport` and the endpoint configuration instead.

## ServiceClient

`createSeaServiceClient` implements the shared Fluid `ServiceClient` contract using the standard container runtime, registry conversion, and service-container helpers.
It supports detached creation and attachment, attached creation, loading by the returned hexadecimal document ID, registry-based data stores, and `oldestSupportedClient` compatibility selection.
Creating a detached container opens no SEA session.

```typescript
import { createSeaServiceClient } from "@fluidframework/sea-driver/internal";
import { createSeaFactories } from "@fluidframework/sea-typescript/internal/presets";

const factories = createSeaFactories({ preset: "split" });
const service = await factories.createMemoryService();
const client = createSeaServiceClient({
	oldestSupportedClient: "2.20.0",
	openSession: service.open,
});
```

Use `client.createContainer(dataStoreKind)` for detached creation and call `attach()` on the returned container.
Alternatively, use `client.createAttachedContainer(dataStoreKind)`.
Pass `container.id` and the matching data store kind or registry to `client.loadContainer`.
The ID is scoped to the injected service; it is not an endpoint URL or an authentication credential.
Local documents remain available only while their caller-owned memory service remains available and cannot be reopened in another browser window or after reload.
Remote clients must use the same running service and matching decorator configuration.

For remote construction, inject `(document, options) => factories.openWebTransport(endpoint, document, options)`.
For compression, select `compressionSupport: true` on the factories and pass `{ ...options, compression: true }` in the injected opener for every collaborating client.
Changing the preset does not change driver or application logic.

Close every returned container before releasing its underlying service.
Container closure stops runtime work and initiates asynchronous membership cleanup but leaves other containers and the service intact; it is not a flush or commit acknowledgement.
Failed creation closes allocated resources, including a document service whose initial summary upload fails before the loader takes ownership.
A failed attachment can still leave backend-allocated data; it does not establish rollback or authorize an implicit retry.
The shared Fluid container helpers retain their existing bounded cleanup-timer limitations.

Automatic summarization uses the standard Fluid runtime's election and summary scheduling policy.
The elected client starts a separate summarizer that publishes and acknowledges snapshots, including incremental summaries, for subsequent loads.
Client-side garbage collection uses the standard Fluid runtime defaults and persists its state in summaries.
This is independent of backend retention: Sea retains stored content and operation history, so automatic summaries do not provide bounded history or background compaction.
Snapshots include versioned driver projection state: the sequence mappings still needed for references and the membership modes at the summary position.
Opening a document restores this state and reads only the snapshot's suffix, without downloading earlier operations.
An open client keeps its selected projection base across reconnects so recovery does not skip unprocessed operations when a newer summary appears.
Snapshots without the current projection format are rejected; there is no legacy-history fallback.
The wrapper does not add automatic reconnect, authentication, or production membership semantics.
The driver depends on the standard loader/runtime helpers but still has no transitive SharedTree dependency, including development dependencies.

## Guarantees and Limits

Summary storage supports full and incremental summaries, blob and tree handles, attachments, and historical versions.
Uploads validate handles, encode blobs on admission, and share an eight-blob concurrency limit across the summary tree.
An upload failure stops new work and drains admitted uploads before returning; publication requires all uploads to succeed.
Incremental publication rejects stale parents.
Uploaded summaries remain private until their Fluid proposal commits, then the adapter publishes the snapshot and appends a durable acknowledgment referencing the proposal.
Acknowledgments occupy their own sequence positions but are excluded from the runtime submission ledger.
Failure between proposal and acknowledgment closes the session without retrying; a committed proposal may remain unacknowledged.
Delta connections preserve pending messages and their original session across explicit recovery; they do not automatically retry or resubmit ambiguous writes.
`recoverPending()` requires a fresh session and replays the old session through its durable leave.
It counts and verifies the accepted application prefix against the ordered attempt ledger before returning the unaccepted suffix; a missing join, missing leave, or non-prefix history rejects recovery.
The driver checks the Fluid client sequence numbers in opaque payloads; Sea does not interpret them or maintain an operation-ID index.
`resubmitPending(transform)` invokes an application-owned transformation of that whole suffix.
The callback supplies fresh-session messages numbered from one, with payloads and reference sequence numbers appropriate after reconciling accepted history.
Neither an old payload nor its old reference is silently reused.
Legacy synthetic-membership clients cannot prove this barrier and cannot use the explicit helper.
Normal Fluid containers use the runtime's pending-state processing and reconnection instead; the driver does not implement DDS rebasing.

### Membership and Signals

Ordered joined/left records carry per-connection identities; readers occupy sequence positions but do not enter the writer quorum.
The signal room supplies initial audience state and live read-only membership; writer quorum changes remain sequenced.
Signals preserve Fluid payloads, sender echo, and optional `targetClientId` with reliable delivery.
Setup-time signals are bounded, replaced registrations are ignored, and delivery failure disconnects rather than silently dropping messages.
Presence uses this path, but a dedicated convergence suite remains outstanding.

The minimum sequence number maps Sea's durable admission floor into Fluid sequence space and remains monotonic across membership changes and reopening.
Legacy injected benchmark clients use synthetic membership and a two-slot sequence offset; use fresh documents when switching to neutral sessions.

### Lifetime

- Membership replacement drains admitted finite reads and uploads, gates new work, and serializes announcement, signal registration, and subscription setup.
- Document-service disposal cancels live streams, rejects new work, and drains finite operations before closing membership; reconnect waits for cleanup.
- Delta disposal closes its session so recovery can observe its final leave. Cleanup cannot close a newer replacement.
- A live document service can still open an unannounced archive session for finite reads after delta disposal. Full disposal or a new delta session drains and closes it.
- Transferred subscriptions belong to their consumer. The pre-opened event stream transfers once; subsequent readers have independent cancellation.
- Closing or replacing an author discards unsubmitted summary proposals. Initial summaries publish immediately; Sea-selected publication follows the current nomination fence.

`pong` reports snapshot-metadata request latency, initially and once per minute after each attempt completes.
Failed probes and late responses after disconnect emit no pong.

Automatic reconnect, authentication, and backend garbage collection remain incomplete.
Ordered writer membership is implemented, but this does not establish production driver conformance.
Summary download materializes a full tree rather than preserving handles.

## Summary Storage

Document creation returns a backend-assigned opaque ID.
The driver places its hexadecimal encoding in the resolved Fluid URL; peers and reloads use that URL rather than a provisional attach name.
The initial summary is uploaded as immutable content, referenced by a committed application initialization event, and published as a snapshot at that event.
Initialization is hidden from Fluid's operation stream and maps to sequence zero.
Subsequent projected operations, membership records, and summary acknowledgments occupy contiguous Fluid sequence numbers independently of the backend's event positions.
Each session scans retained history to reconstruct this mapping before opening its live subscription, so startup cost grows with retained history.
Every finite projected history read cancels its stream on completion or failure, including malformed initialization during startup.

Snapshot version handles encode committed event positions.
Bounded snapshot lookup requires an exact position match for a Fluid version request.
Publishing different state at the same position is rejected; summaries of later state require later committed positions.
There are no independent snapshot-operation identities or pre-event initial snapshots.

`createBlob()` uploads an immutable attachment blob and returns its content identity.
An attachment summary node reuses that identity without uploading the content again.
The Sea storage backends validate referenced blobs and directories, so an unknown attachment identity is rejected.

For an incremental summary, the driver resolves the parent from `ISummaryContext.ackHandle`, falling back to `proposalHandle`.
Blob and tree handles are paths into that parent snapshot.
The driver resolves those paths, reuses the referenced identities, uploads new content, and conditionally publishes against the expected parent.
A stale parent fails without retry because selecting another parent could change the summary's event boundary or invalidate its handles.
The current implementation fetches the complete parent directory manifest and rebuilds the complete directory structure.
Content addressing avoids persisting unchanged content again, but parent traversal and idempotent directory requests still consume work.
Summary download materializes a full tree and does not distinguish separately uploaded attachments from other blob leaves.

## Submission and Snapshot Coordination

The neutral session supplies ordered submission acknowledgments.
A submission remains pending until its acknowledgment arrives or its projected local operation is observed.
Write failure or response loss rejects `waitForIdle()` without discarding pending identity.
Explicit recovery and transformed resubmission follow the terminal-prefix contract above; a single `notCommitted` lookup does not authorize replay.
Reconnect replaces the projected-operation subscription, resuming from the last projected cursor.
`restartSubscription()` replaces only the projected reader from its consumed cursor, preserving the Fluid client identity, writer membership, signal registration, and submission sequence.
It does not perform session recovery or reannounce membership; later operations continue through the existing Fluid connection.
Disconnect and disposal close or cancel their owned resources.
Disposal is synchronous at the Fluid interface boundary while session close and subscription cancellation finish asynchronously.

The regular `SeaDriver` uses `ClientSelected` snapshot participation, leaving publisher selection to Fluid.
The direct SharedTree benchmark uses `SeaSelected`, which grants one current publisher fence when no client-selected publisher is active.
Both receive accepted-snapshot updates; `ReadOnly` receives updates but cannot publish.

## Development

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-driver run build
pnpm --dir rust-service/packages/sea-driver test
```

The package build compiles TypeScript, generates entrypoints and API reports, and checks formatting, lint, and export release tags.
Package-owned Mocha suites exercise the implementation entrypoint, including incremental summaries, stale-parent rejection, neutral-session initialization and startup cleanup, submission recovery, lifecycle races, and dependency isolation.
The build compiles the separate test project; the test command uses the shared Fluid Mocha setup and reporters.
To build and test in one step, run `pnpm exec fluid-build rust-service/packages/sea-driver --task test:mocha:esm` from the repository root.
The [integration harness](../../tests/sea-integration-tests/README.md) retains SharedTree-based ServiceClient scenarios, browser traces, and benchmarks and includes these package tests in its aggregate command.
Package-owned ServiceClient tests cover automatic summaries, persisted client GC state, snapshot reload, registry lookup, compatibility options, and failed-attachment cleanup.
The Chromium harness covers remote collaboration, explicit recovery, and reopening under both presets, with and without compression.
Fluid broadcast and targeted-signal E2E tests use the Rust WebSocket listener; see the harness guide for separate inventory-app and external-browser coverage.
All reported APIs are internal; API reports are generated, not edited by hand.
