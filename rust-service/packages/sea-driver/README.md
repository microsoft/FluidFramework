# @fluidframework/sea-driver

Use this package to connect a Fluid loader to the Sea service through an injected `SeaDriverClient`.
It implements document services, summary and blob storage, bounded delta storage, and delta connections with explicit disconnect, reconnect, and submission recovery.

## Entry Point

All exports are `@internal`; there is no supported public API yet.

The factory publishes its generated package version, current Fluid layer generation, and loader requirements through the standard layer-compatibility interfaces.
The loader validates both directions of that boundary before creating or loading a document service.
The declarations use the shared driver-to-loader generation policy and no additional required or supported feature names.
This metadata does not broaden the current-version-only SEA integration configuration or claim historical-loader conformance.

```typescript
import { SeaDriver, type WasmClientFactory } from "@fluidframework/sea-driver/internal";

export function createDriver(createClient: WasmClientFactory): SeaDriver {
	return new SeaDriver(createClient);
}
```

The client factory supplies transport initialization and returns a fresh client for each logical Fluid client.
The package has no SharedTree dependency, including through workspace development dependencies.
It does not generate or load WebAssembly (WASM), start a service, or select a transport.
`SeaSessionDriverClient` adapts a neutral `sea-typescript` session supplied by an injected `SeaSessionFactory`.
The factory retains the selected service and compression configuration and returns fresh membership for each create or open.
The [integration harness](../../tests/minimal-fluid-driver/README.md) provides local and WebTransport examples through the neutral package entrypoints.

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

Automatic summarization and garbage collection are disabled for this adapter.
The initial summary and subsequent operation history support loading, but no bounded-history or background-compaction guarantee is made.
The wrapper does not add automatic reconnect, authentication, or production membership semantics.
The driver depends on the standard loader/runtime helpers but still has no transitive SharedTree dependency, including development dependencies.

## Guarantees and Limits

Summary storage supports full and incremental summaries, blob and tree handles, attachments, and historical versions.
Each summary uploads up to eight independent blobs concurrently, refilling a slot as soon as its request completes rather than waiting for a batch of round trips.
The bound is shared across the summary's entire tree; content encoding waits until upload admission.
Handles are validated before uploading, and manifest and snapshot publication wait for all uploads to succeed.
On the first observed upload failure, no further blobs are scheduled; admitted uploads are drained before the error returns, with no implicit retries or partial snapshot publication.
Incremental publication retains the acknowledged parent snapshot and rejects stale parents.
The neutral-session adapter verifies that a summary proposal names a published snapshot before appending it.
It then appends a separate durable Fluid acknowledgment referencing the proposal's sequence number.
Live delivery and replay project that record as a system message with its own sequence position; the neutral sequencer does not interpret Fluid summaries.
These adapter-owned acknowledgment records are not runtime submissions and are excluded from the runtime attempt-prefix ledger.
A failure between proposal and acknowledgment closes the session and may leave a committed proposal without an acknowledgment; the adapter never blindly retries either record.
Delta connections preserve pending submission identities across explicit recovery; they do not automatically retry or resubmit ambiguous writes.
`recoverPending()` requires a fresh session and replays the old session through its durable leave.
It counts and verifies the accepted application prefix against the ordered attempt ledger before returning the unaccepted suffix; a missing leave or non-prefix history rejects recovery.
`resubmitPending(transform)` invokes an application-owned transformation of that whole suffix.
The callback supplies fresh-session messages numbered from one, with payloads and reference sequence numbers appropriate after reconciling accepted history.
New submission identities are allocated; neither an old payload nor its old reference is silently reused.
Legacy synthetic-membership clients cannot prove this barrier and cannot use the explicit helper.
Normal Fluid containers use the runtime's pending-state processing and reconnection instead; the driver does not implement DDS rebasing.

The neutral-session adapter owns Fluid initialization events and the bidirectional mapping between opaque SEA positions and Fluid sequence numbers.
It announces membership through the neutral session contract and projects shared joined/left records with per-connection identities.
Read-only membership records occupy sequence positions without adding readers to the writer quorum.
Initial audience state and live read-only joins/leaves use the independent signal room; writers remain controlled by sequenced quorum operations.
Legacy injected clients without a signal capability retain the durable-history audience projection.
Application signals use reliable delivery, including sender echo and optional `targetClientId`; Fluid never opts into Sea best effort.
The driver preserves setup-time signals in a bounded initial batch and ignores observations from replaced registrations.
Signal delivery failure disconnects the delta connection rather than silently dropping reliable messages.
Payloads are unchanged Fluid signal strings; the Sea host does not interpret Presence state or revision semantics.
Existing Fluid broadcast and targeted-signal E2E suites run against the Rust WebSocket listener.
Presence uses this runtime signal path, but these tests are not a separate Presence convergence suite.
The projected Fluid minimum sequence number maps SEA's durable admission floor into the same dense sequence space.
It advances monotonically across membership changes and reopening, independently of server history retention.
The adapter still retains all operation history; floor enforcement does not claim garbage collection or compaction.
This path has no synthetic sequence offset; legacy injected benchmark clients retain the earlier two-slot projection.
The two projections are not interoperable within one document; use fresh test documents when migrating from the synthetic projection.
It watches snapshot coordination continuously so SEA-selected publication uses the current observed nomination fence.
Summary uploads are staged privately until the matching Fluid summary proposal commits, then published before the durable acknowledgment.
Closing or replacing the author discards unsubmitted proposals without advancing the latest snapshot; initial document summaries publish immediately.
Pong listeners receive measured round-trip milliseconds from a read-only snapshot-metadata request, initially and once per minute after each completed attempt.
This measures service-request latency, not a transport-only heartbeat; failed probes emit no pong and disconnected connections suppress late results.
Membership replacement waits for admitted finite archive reads and blob uploads to finish and defers later reads and uploads until the replacement opens.
Document services serialize each delta opening through membership announcement, signal registration, and subscription setup before another delta opening can replace the shared session.
Independent blob uploads remain concurrent within that gate; no live session is selected before a pending replacement completes.
Each document service retains a unique SEA author for read-first connections, independent of shared projected Fluid client labels.
Document-service disposal cancels owned live streams and prevents new reads and uploads, but drains admitted finite archive reads and blob uploads before membership close.
Reconnect waits for that cleanup, and the next open calls the injected factory.
Delta disposal also closes its owning session so Fluid pending-state recovery can observe the old client's final leave.
Cleanup carries the original session identity and cannot close a newer replacement sharing the same adapter.
After delta disposal, the still-live document service can lazily open an unannounced archive session for finite storage work, including data-store blobs fetched by a paused container.
Concurrent requests share that opening; it does not restore delta author authority or announce another Fluid member.
Full service disposal or a new delta session drains admitted archive work and closes that archive session, including an opening still in progress.
Transferred projected subscriptions remain cancellation-owned by their driver consumer.
The pre-opened event stream can be transferred only once; later subscriptions at the same cursor open independent readers, and cancelling one does not cancel another.

Automatic reconnect, authentication, and garbage collection remain incomplete.
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
These participation policies do not enable automatic summarization in `createSeaServiceClient`.

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
The [integration harness](../../tests/minimal-fluid-driver/README.md) retains SharedTree-based ServiceClient scenarios, browser traces, and benchmarks and includes these package tests in its aggregate command.
The real Chromium SharedTree trace covers collaboration, explicit disconnect/recovery, and reload using the neutral remote factory.
Eight consecutive migrated runs passed after fixing interrupted archive reads during membership replacement and author collisions between read-first containers.
Deterministic Node regressions cover both ownership boundaries.
Package-owned ServiceClient tests cover registry lookups, compatibility options, and failed-attachment cleanup without a SharedTree dependency.
Harness ServiceClient tests cover both presets, detached creation without membership, concurrent/repeated attachment rejection, attached creation, reload, and SharedTree collaboration.
The driver summary fixture separately localizes cleanup on initial-summary failure.
The canonical browser harness runs real remote ServiceClient collaboration and reopening under both presets, with and without compression, in Chromium inside the Codespace.
These tests do not establish inventory-app or external-browser acceptance.
All reported APIs are internal; API reports are generated, not edited by hand.
