# @fluidframework/sea-driver

Use this package to connect a Fluid loader to the Sea service through an injected `SeaDriverClient`.
It implements document services, summary and blob storage, bounded delta storage, and delta connections with explicit disconnect, reconnect, and submission recovery.

## Entry Point

All exports are `@internal`; there is no supported public API yet.

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
The wrapper does not add automatic reconnect, presence, authentication, or production membership semantics.
The driver depends on the standard loader/runtime helpers but still has no transitive SharedTree dependency, including development dependencies.

## Guarantees and Limits

Summary storage supports full and incremental summaries, blob and tree handles, attachments, and historical versions.
Incremental publication retains the acknowledged parent snapshot and rejects stale parents.
Delta connections preserve pending submission identities across explicit recovery; they do not automatically retry or resubmit ambiguous writes.

The neutral-session adapter owns Fluid initialization events and the bidirectional mapping between opaque SEA positions and Fluid sequence numbers.
It announces membership through the neutral session contract and projects shared joined/left records with per-connection identities.
Read-only membership records occupy sequence positions without adding readers to the writer quorum.
The projected Fluid minimum sequence number remains zero because this adapter retains all operation history.
SEA's active-member minimum can decrease when a fresh session opens; it is not Fluid's nondecreasing retention boundary.
An advancing Fluid minimum requires a separate retention policy and is not implemented.
This path has no synthetic sequence offset; legacy injected benchmark clients retain the earlier two-slot projection.
The two projections are not interoperable within one document; use fresh test documents when migrating from the synthetic projection.
It watches snapshot coordination continuously so SEA-selected publication uses the current observed nomination fence.
Membership replacement waits for admitted archive reads to finish and defers later reads until the replacement opens.
Each document service retains a unique SEA author for read-first connections, independent of shared projected Fluid client labels.
Disconnect cancels owned streams and starts membership close; reconnect waits for that cleanup, and the next open calls the injected factory.
Transferred projected subscriptions remain cancellation-owned by their driver consumer.

Signals, audience presence, automatic reconnect, authentication, and garbage collection remain incomplete.
Ordered writer membership is implemented, but this does not establish production driver conformance.
Summary download materializes a full tree rather than preserving handles.
See the harness's [storage and lifecycle contracts](../../tests/minimal-fluid-driver/README.md) for the generated-client projection and snapshot semantics.

## Development

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-driver run build
pnpm --dir rust-service/tests/minimal-fluid-driver test
```

The package build compiles TypeScript, generates entrypoints and API reports, and checks formatting, lint, and export release tags.
The harness tests exercise the package entrypoint, including incremental summaries, stale-parent rejection, neutral-session initialization and startup cleanup, direct SharedTree collaboration, and dependency isolation.
The real Chromium SharedTree trace covers collaboration, explicit disconnect/recovery, and reload using the neutral remote factory.
Eight consecutive migrated runs passed after fixing interrupted archive reads during membership replacement and author collisions between read-first containers.
Deterministic Node regressions cover both ownership boundaries.
ServiceClient Node tests cover both presets, detached creation without membership, concurrent/repeated attachment rejection, attached creation, reload and collaboration, registry lookups, compatibility options, and failed-attachment cleanup.
The driver summary fixture separately localizes cleanup on initial-summary failure.
The canonical browser harness runs real remote ServiceClient collaboration and reopening under both presets, with and without compression, in Chromium inside the Codespace.
These tests do not establish inventory-app or external-browser acceptance.
All reported APIs are internal; API reports are generated, not edited by hand.
