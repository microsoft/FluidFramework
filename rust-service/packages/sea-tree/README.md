# @fluidframework/sea-tree

Use this package to host a SharedTree kernel directly on the Sea service without a Fluid container runtime.
It depends on SharedTree, the ID compressor, and the transport-neutral client contracts in [sea-driver](../sea-driver/README.md).
The supplied client must support `openDirectSession`, as `SeaSessionDriverClient` does.

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
Opening an existing document loads its latest direct-host summary and replays the remaining operations before `create()` returns, so the caller can configure a view immediately.
`waitForIdle()` waits for the host's current local submissions to be acknowledged and applied; it does not wait for another client to catch up.
Dispose views when finished, then call `dispose()` to stop subscription processing and disconnect the client.

## Guarantees and Limits

The host submits SharedTree messages with their ID creation ranges and applies sequenced operations in bounded batches.
It uses Sea positions directly as SharedTree sequence numbers, without a Fluid projection or position-mapping tables.
Positions can be sparse and can start at zero.
Each position and reference must convert losslessly to a JavaScript safe integer (at most `Number.MAX_SAFE_INTEGER`, or 2^53 - 1); larger values cause an assertion failure rather than rounding.
An absent reference uses -1, which precedes every Sea position.
Subscription and submission failures trigger automatic reconnect with bounded retry frequency.
`connectionState`, `pendingOperationCount`, and `lastError` expose progress and failures.
Use `onStatusChange()` to observe changes without polling.
Background failures from an earlier connection do not overwrite the current status after disconnect, reconnect, or disposal.
Failures in the current connection are still reported.

This is not a Fluid driver or container implementation.
The host retains the existing tree and application views during reconnect.
It announces author membership, waits for terminal history to establish the old accepted prefix, applies accepted edits exactly once, and asks SharedTree to re-encode only the unaccepted suffix.
ID-compressor ranges are reset only after that terminal proof.
Call `disconnect()` to pause transport explicitly and `reconnect()` to resume.
Automatic recovery requires a client that supports authoritative membership, such as `SeaSessionDriverClient`.
Invalid canonical history or a failed kernel transformation stops the host in the `error` state rather than retrying it.

Pending edits are held only in memory.
Closing or reloading a tab before its edits synchronize loses those edits; this is not offline stashing or crash recovery.

The nominated client publishes a full SharedTree summary after 100 applied application operations or five seconds without new application operations.
The optional sixth argument to `create()` configures `summaryMaxOperations` and `summaryIdleMs`.
Only acknowledged state is summarized; local pending edits defer publication.
Unchanged state is not repeatedly summarized, and failed publication is reported and retried after the idle interval.
Snapshots include finalized ID-compressor state and the last applied Sea position, and publication uses the current nomination fence and expected parent.
`summaryCount`, `lastSummarySequenceNumber`, and `loadedFromSummary` expose snapshot activity.
`summarize()` requests publication immediately when eligible.
These are full summaries, not incremental uploads.
Loading reads only the snapshot's suffix; reconnect reads only after the last applied position.
Direct snapshot metadata uses version 2.
Older snapshots containing dense Fluid sequence numbers are rejected, not migrated; create a fresh document when using the new format.

The [neutral package](../sea-typescript/README.md) supplies concrete sessions for the package-owned collaboration test.
The [integration harness](../../tests/sea-integration-tests/README.md) supplies browser comparison benchmarks.

## Development

From the repository root:

```bash
pnpm --dir rust-service/packages/sea-tree run build
pnpm --dir rust-service/packages/sea-tree test
```

The build checks TypeScript, API reports, formatting, lint, and exports.
Mocha tests collaboration, summary scheduling and suffix-only loading, sparse positions, numeric limits, incompatible formats, offline edits, lost acknowledgments, and failed transport cleanup through the package entrypoint.
To build and test in one step, run `pnpm exec fluid-build rust-service/packages/sea-tree --task test:mocha:esm` from the repository root.
The harness retains the direct SharedTree benchmarks and includes this package test in its aggregate command.
