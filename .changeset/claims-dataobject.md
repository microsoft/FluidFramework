---
"@fluidframework/claims-dds": minor
"@fluidframework/aqueduct": minor
"__section": feature
---
Add first-writer-wins claims to DataObject via a new internal SharedClaims DDS

This adds a new "claim" primitive for partner scenarios that need to wire up
singleton entries (typically a handle to a child DDS or data store) with
first-writer-wins semantics, rather than the last-writer-wins semantics of
writing to a `SharedMap` / `SharedDirectory`.

The feature ships as:

- **New package** `@fluidframework/claims-dds` exporting `SharedClaims`,
  a small DDS that stores immutable, first-writer-wins key/value entries.
  The entire public surface of this package is `@internal` — it is
  intended to be consumed only through the `DataObject` helpers below,
  not directly. Each key can be set at most once for the lifetime of the
  document; the first sequenced op wins and every subsequent attempt —
  local or remote — observes `"AlreadyClaimed"`. Values are
  JSON-serializable and may contain `IFluidHandle` instances, which are
  encoded the standard way and contribute outbound routes to garbage
  collection.

- **Auto-installation on `DataObject`**: every `DataObject` is now primed
  with a `SharedClaims` channel (id `claims`) alongside `root`. The new
  helpers `DataObject.trySetClaim`, `DataObject.getClaim`, and
  `DataObject.hasClaim` (all `@internal`) delegate to that channel. The
  `DataObjectFactory` automatically registers `SharedClaimsFactory` (no
  consumer action required).

Internal API surface:

- `SharedClaims`, `SharedClaimsFactory`, `ISharedClaims`, `ISharedClaimsEvents`.
- `ClaimResult = "Success" | "AlreadyClaimed"` — terminal sequenced
  outcome of a claim attempt.
- `IClaimAttempt` — the synchronous return shape of `trySetClaim`. It is
  a discriminated union on `status`:
  - `{ status: "Success" | "AlreadyClaimed" }` when the outcome is
    already known locally (detached, or the key was previously
    sequenced). There is nothing to await.
  - `{ status: "Pending"; result: Promise<ClaimResult> }` when the
    outcome can't be determined locally yet — for example, the client
    is attached but disconnected, or the op has been submitted but not
    yet sequenced. The `result` promise resolves to the final
    sequenced `ClaimResult`, or rejects if the runtime is disposed
    (or the attempt is discarded with staged changes) before the
    attempt is sequenced.
- `DataObject.trySetClaim`, `getClaim`, `hasClaim` convenience helpers
  forwarding to the auto-installed `SharedClaims` channel.

Use a claim (rather than writing to `DataObject.root`) when you specifically
need first-writer-wins semantics — for example, when multiple clients race
to designate themselves as the owner of a particular role within the data
store and only one should succeed.

Compatibility: documents created or opened by code that has this change
will gain a new `claims` channel inside every `DataObject`. Older clients
that open such documents will see the channel as an unknown DDS type and
won't be able to interact with claims, but the rest of the data object
continues to work normally. No new top-level op type is introduced — the
new channel uses ordinary DDS ops.
