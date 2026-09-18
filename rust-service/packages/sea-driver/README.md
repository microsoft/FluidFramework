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
The [integration harness](../../tests/minimal-fluid-driver/README.md) provides the generated WASM binding adapter and local and WebTransport examples.

## Guarantees and Limits

Summary storage supports full and incremental summaries, blob and tree handles, attachments, and historical versions.
Incremental publication retains the acknowledged parent snapshot and rejects stale parents.
Delta connections preserve pending submission identities across explicit recovery; they do not automatically retry or resubmit ambiguous writes.

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
The harness tests exercise the package entrypoint, including incremental summaries, stale-parent rejection, generated-client initialization, and dependency isolation.
All reported APIs are internal; API reports are generated, not edited by hand.