# @fluidframework/sea-driver

Use this package to connect a Fluid loader to the Sea service through an injected `SeaDriverClient`.
It implements document services, summary and blob storage, bounded delta storage, and delta connections with explicit disconnect, reconnect, and submission recovery.

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
The driver still scans retained history to reconstruct sequence-number mappings before replaying the selected snapshot's suffix.
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
