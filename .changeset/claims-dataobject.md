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

- `ClaimResult = "Success" | "AlreadyClaimed"`.
- `IFluidDataStoreRuntime.trySetClaim(key, value)`, `getClaim(key)`,
  `hasClaim(key)`, and `claims` (a read-only iterator).
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
