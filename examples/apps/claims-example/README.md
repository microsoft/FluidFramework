# @fluid-example/claims-example

This example demonstrates the **Claims DDS** running inside a **real Fluid container**. It claims ownership of resources by binding claim keys to the **`IFluidHandle`** of other DDSes.

> **Why this shape?** The Claims DDS is currently an internal building block. The intent is for it to eventually live inside every `PureDataObject`, reachable through an API on the data object itself. That API does not exist yet, so this example wires the Claims DDS up by hand inside a custom `ResourceManager` data object to show the underlying mechanics.

## What it shows

The example runs two independent clients against a single in-memory ordering service (`LocalDeltaConnectionServer`). Everything other than the service is real: a real container runtime, real ops that roundtrip through the service, and real handle serialization across clients.

A custom `ResourceManager` data object hosts one Claims DDS. To claim a resource, the client creates a brand-new `SharedMap` (the "resource") and stores **its handle** as the claim value. Other clients read the claim and resolve the handle to access the same underlying DDS.

## ClaimResult overview

`ClaimResult<T>` is a discriminated union returned by `trySetClaim` / `compareAndSetClaim`:

| Status | Meaning | Available fields |
|--------|---------|-----------------|
| `"Accepted"` | Claim accepted synchronously (only in detached mode) | `currentValue: T` |
| `"AlreadyClaimed"` | Another client already claimed this key | `currentValue: T \| undefined` |
| `"Pending"` | Op is in-flight awaiting server confirmation | `promise: Promise<ClaimConfirmation<T>>` |

In a connected container, `trySetClaim` returns `"Pending"`; awaiting the promise yields a `ClaimConfirmation<T>` whose status is `"Accepted"`, `"AlreadyClaimed"`, or `"Aborted"`.

## Scenarios demonstrated

1. **Claim a resource** — client A creates a new `SharedMap` and claims its handle under `"database"`.
2. **Cross-client read** — client B loads the same document and resolves the claimed handle to the same resource.
3. **First-writer-wins** — client B's competing claim for `"database"` is rejected and returns the winner's handle.
4. **Race** — both clients claim a fresh key concurrently; the ordering service picks the winner.
5. **Compare-and-swap** — client A atomically reassigns `"config"` to a new handle.

## Running

```bash
# From the repo root
cd examples/apps/claims-example
npm run build:esnext
npm start
```

## Key pattern

Consuming `ClaimResult` with handles in a connected container:

```typescript
const resourceHandle: IFluidHandle<ISharedMap> = resourceManager.createResource("my-resource");
const result = resourceManager.claims.trySetClaim("resource-key", resourceHandle);

switch (result.status) {
    case "Accepted": {
        // Detached-only: you won immediately.
        const mine = await result.currentValue.get();
        break;
    }
    case "AlreadyClaimed": {
        // Someone else won — resolve the winner's handle.
        const theirs = await result.currentValue?.get();
        break;
    }
    case "Pending": {
        // Connected: await server confirmation.
        const confirmation = await result.promise;
        if (confirmation.status === "Accepted") {
            const mine = await confirmation.currentValue.get();
        } else if (confirmation.status === "AlreadyClaimed") {
            const theirs = await confirmation.currentValue?.get();
        }
        break;
    }
}
```
