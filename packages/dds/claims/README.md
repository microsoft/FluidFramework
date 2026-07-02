# @fluid-internal/claims

A distributed data structure (DDS) for first-writer-wins claim management with optional compare-and-swap (CAS) support.

## Overview

The `Claims` DDS provides a key-value store with controlled write semantics:

-   **Write-once (claims):** Use `trySetClaim(key, value)` to claim a key. Once claimed, a key cannot be overwritten. This is useful for scenarios like aliasing, singleton creation, or task assignment where exactly one client should "win."
-   **Compare-and-swap (CAS):** Use `compareAndSetClaim(key, newValue)` to update a key's value. On the wire, the DDS uses per-key sequence numbers for conflict resolution, so concurrent writes are detected automatically.

Both modes are optimistic: when attached, a local op is submitted and a `"Pending"` result is returned with a promise that resolves once the server acknowledges the op. In detached mode, values are applied immediately and return an `"Accepted"` result. Operations are also permitted while disconnected — they are queued and resubmitted on reconnect.

## Usage

### Claiming a key (write-once)

```typescript
const result = claims.trySetClaim("singleton-component", componentHandle);

if (result.status === "AlreadyClaimed") {
	// Another client already claimed it; use result.currentValue.
} else if (result.status === "Pending") {
	const confirmation = await result.promise;
	if (confirmation.status === "Accepted") {
		// This client successfully claimed the key.
	} else if (confirmation.status === "AlreadyClaimed") {
		// Lost the race; use confirmation.currentValue.
	}
}
```

### Compare-and-swap (CAS)

```typescript
const current = claims.get("config-key");
const result = claims.compareAndSetClaim("config-key", newConfig);

if (result.status === "Pending") {
	const confirmation = await result.promise;
	if (confirmation.status === "Accepted") {
		// Update succeeded.
	} else {
		// Another client updated first; retry with new value.
	}
}
```

### Events

```typescript
// Emitted when a claim is accepted (both write-once and CAS).
claims.events.on("claimed", (key: string) => {
	console.log(`Key ${key} updated to:`, claims.get(key));
});
```

## API

### `IClaims<T>`

| Method                                                                        | Description                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `trySetClaim(key: string, value: T): ClaimResult<T>`                          | Write-once claim. Fails if key already exists.                 |
| `compareAndSetClaim(key: string, value: T): ClaimResult<T>` | CAS update. Uses per-key sequence numbers on the wire for conflict resolution. |
| `get(key: string): T \| undefined`                                       | Get the current committed value for a key.                     |
| `has(key: string): boolean`                                                   | Check whether a key has been claimed (distinguishes unset from `undefined` values). |

### Result types

-   **`ClaimResult<T>`**: `{ status: "Accepted", currentValue: T }` | `{ status: "AlreadyClaimed", currentValue: T }` | `{ status: "Pending", promise: Promise<ClaimConfirmation<T>> }`
-   **`ClaimConfirmation<T>`**: `{ status: "Accepted", currentValue: T }` | `{ status: "AlreadyClaimed", currentValue: T }` | `{ status: "Aborted" }`
