# @fluidframework/sea-tree

Use this package to host a SharedTree kernel directly on the Sea service without a Fluid container runtime.
It depends on SharedTree, the ID compressor, and the transport-neutral client contracts in [sea-driver](../sea-driver/README.md).

## Entry Point

All exports are `@internal`; there is no supported public API yet.

```typescript
import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
import type { SeaDriverClient } from "@fluidframework/sea-driver/internal";

export async function createTree(client: SeaDriverClient): Promise<DirectSharedTreeClient> {
	return DirectSharedTreeClient.create(client, new Uint8Array(), 64, 1024 * 1024, true);
}
```

Configure the returned `tree` with a SharedTree view and schema.
Use the returned `documentId` when opening a peer with `createDocument` set to `false`.
`waitForIdle()` waits for the host's current local submissions to be acknowledged and applied; it does not wait for another client to catch up.
Dispose views when finished, then call `dispose()` to stop subscription processing and disconnect the client.

## Guarantees and Limits

The host submits SharedTree messages with their ID creation ranges and applies sequenced operations in bounded batches.
It retains the mapping between Sea positions and SharedTree sequence numbers for the lifetime of the host.
Subscription failures are surfaced by `waitForIdle()`.

This is not a Fluid driver or container implementation.
The host does not implement snapshot persistence, snapshot loading, or automatic reconnect and recovery.
The caller supplies an initialized client.
The [neutral package](../sea-typescript/README.md) supplies concrete sessions for the package-owned collaboration test.
The [integration harness](../../tests/sea-integration-tests/README.md) supplies browser comparison benchmarks.

## Development

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-tree run build
pnpm --dir rust-service/packages/sea-tree test
```

The build checks TypeScript, API reports, formatting, lint, and exports; Mocha tests two-way collaboration through the package entrypoint.
To build and test in one step, run `pnpm exec fluid-build rust-service/packages/sea-tree --task test:mocha:esm` from the repository root.
The harness retains the direct SharedTree benchmarks and includes this package test in its aggregate command.
