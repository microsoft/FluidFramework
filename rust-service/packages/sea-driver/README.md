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
The [integration harness](../../tests/minimal-fluid-driver/README.md) provides local and WebTransport examples; its older generated adapter remains temporarily for benchmark consumers.

```typescript
import { SeaDriver, SeaSessionDriverClient } from "@fluidframework/sea-driver/internal";
import { createMemoryService } from "@fluidframework/sea-typescript/internal";

const service = await createMemoryService({ environment: "node" });
const driver = new SeaDriver(async () => new SeaSessionDriverClient(service.open, "clientSelected"));
```

The application owns the memory service lifetime and closes it after its clients are done.
For remote sessions, inject a closure over `openWebTransport` and the endpoint configuration instead.

## Guarantees and Limits

Summary storage supports full and incremental summaries, blob and tree handles, attachments, and historical versions.
Incremental publication retains the acknowledged parent snapshot and rejects stale parents.
Delta connections preserve pending submission identities across explicit recovery; they do not automatically retry or resubmit ambiguous writes.

The neutral-session adapter owns Fluid initialization events and the bidirectional mapping between opaque SEA positions and Fluid sequence numbers.
It watches snapshot coordination continuously so SEA-selected publication uses the current observed nomination fence.
Membership replacement waits for admitted archive reads to finish and defers later reads until the replacement opens.
Each document service retains a unique SEA author for read-first connections, independent of shared projected Fluid client labels.
Disconnect cancels owned streams and starts membership close; reconnect waits for that cleanup, and the next open calls the injected factory.
Transferred projected subscriptions remain cancellation-owned by their driver consumer.

Signals, presence, automatic reconnect, authentication, production Fluid membership, and garbage collection are not implemented.
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
All reported APIs are internal; API reports are generated, not edited by hand.
