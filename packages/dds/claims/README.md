# @fluidframework/claims

A distributed data structure (DDS) for first-writer-wins claim management with optional compare-and-swap (CAS) support.

## Overview

The `Claims` DDS provides a key-value store with controlled write semantics:

-   **Write-once (claims):** Use `trySetClaim(key, value)` to claim a key. Once claimed, a key cannot be overwritten without providing the expected current value. This is useful for scenarios like aliasing, singleton creation, or task assignment where exactly one client should "win."
-   **Compare-and-swap (CAS):** Use `trySetClaim(key, newValue, expectedValue)` to update a key's value only if the current value matches `expectedValue`. This enables safe concurrent updates without overwriting changes from other clients.

Both modes are optimistic: a local op is submitted and a `"Pending"` result is returned with a promise that resolves once the server acknowledges the op.

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
const current = claims.getClaim("config-key");
const result = claims.trySetClaim("config-key", newConfig, current);

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
claims.on("claimed", (key: string) => {
	console.log(`Key ${key} updated to:`, claims.getClaim(key));
});
```

## API

### `IClaims<T>`

| Method                                                                        | Description                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `trySetClaim(key: string, value: T): ClaimResult<T>`                          | Write-once claim. Fails if key already exists.                 |
| `trySetClaim(key: string, value: T, expectedValue: T): ClaimResult<T>`        | CAS update. Fails if current value ≠ expected.                 |
| `getClaim(key: string): T \| undefined`                                       | Get the current committed value for a key.                     |

### Result types

-   **`ClaimResult<T>`**: `{ status: "Accepted", currentValue: T }` | `{ status: "AlreadyClaimed", currentValue: T }` | `{ status: "Pending", promise: Promise<ClaimConfirmation<T>> }`
-   **`ClaimConfirmation<T>`**: `{ status: "Accepted", currentValue: T }` | `{ status: "AlreadyClaimed", currentValue: T }` | `{ status: "Aborted" }`
