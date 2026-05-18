---
"@fluidframework/datastore-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/aqueduct": minor
"__section": feature
---
Add first-writer-wins claims to data store runtime and DataObject

This adds a new "claim" primitive to `IFluidDataStoreRuntime` and `DataObject`
that lets a data store publish first-writer-wins key/value entries. A claim
is conceptually a small piece of immutable per-data-store state where the
first client to write a given key wins; concurrent writers from other clients
observe `"AlreadyClaimed"` and can branch their logic accordingly.

New API surface (all `@legacy` `@beta`):

- `ClaimResult = "Success" | "AlreadyClaimed"` — terminal sequenced
  outcome of a claim attempt.
- `IClaimAttempt` — the synchronous return shape of `trySetClaim`. It is
  a discriminated union on `status`:
  - `{ status: "Success" | "AlreadyClaimed" }` when the outcome is
    already known locally (detached, or the key was previously
    sequenced). There is nothing to await.
  - `{ status: "Pending"; result: Promise<ClaimResult> }` when the
    outcome can't be determined locally yet — for example, the client
    is attached but disconnected, the op has been submitted but not
    yet sequenced, or claim state is still being hydrated from the
    base snapshot. The `result` promise resolves to the final
    sequenced `ClaimResult`, or rejects if the runtime is disposed
    before the attempt is sequenced.
- `IFluidDataStoreRuntime.trySetClaim(key, value): IClaimAttempt`,
  `getClaim(key)`, `hasClaim(key)`, and `claims` (a read-only iterator).
- `IFluidDataStorePolicies.enableDataStoreClaims` opt-in flag (defaults to
  off; set to `true` on the data store runtime to enable the API).
- `DataObject.trySetClaim`, `getClaim`, `hasClaim` convenience helpers that
  forward to the runtime.

Claim values may contain `IFluidHandle` instances; these are encoded the same
way as handles in summary blobs and contribute outbound routes to garbage
collection. Claims are persisted via a `.claims` summary blob on the data
store and rehydrated on subsequent loads.

Use a claim (rather than writing to `DataObject.root`) when you specifically
need first-writer-wins semantics — for example, when multiple clients race
to designate themselves as the owner of a particular role within the data
store and only one should succeed.
