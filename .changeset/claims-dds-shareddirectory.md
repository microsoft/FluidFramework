---
"@fluidframework/map": minor
"__section": feature
---
Add first-writer-wins claim API on SharedDirectory (`trySetClaim`/`isClaimed`)

`ISharedDirectory` now exposes two new methods on the root directory:

- `trySetClaim(key, value): Promise<ClaimResult>` — Attempts to claim a root-level key with a value using first-writer-wins semantics across all clients. Resolves to `"Success"` if this client (or this client's already-pending attempt) won, or `"AlreadyClaimed"` if another client's claim was sequenced first.
- `isClaimed(key): boolean` — Returns `true` if the root-level key is currently claimed.

Once a key is claimed, the value is immutable: `set` and `delete` for that key throw `UsageError`, and `get` returns the claimed value. `clear()` does not remove claims. Claims survive summary/load.

This API is gated behind a runtime opt-in. To enable it, set `enableDdsClaims: true` on the data store runtime options. Calling `trySetClaim` or `isClaimed` without the flag enabled throws `UsageError`.

Claims are only available on the root `ISharedDirectory`; subdirectories (`IDirectory`) intentionally do not expose these methods.
