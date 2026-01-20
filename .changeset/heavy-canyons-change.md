---
"@fluidframework/tree": minor
"__section": deprecation
---
`getRevertible` has moved onto `ChangeMetadata`

The `getRevertible` factory provided by the `changed` event is now exposed on the `ChangeMetadata` object instead of as
the second callback parameter. The second parameter is deprecated and will be removed in a future release.

#### Why this change?

Keeping all per-change data on `ChangeMetadata` makes the API:

1. Easier to discover.
1. Easier to ignore.
1. Require less parameter churn to use.
1. Consistent with the `getChange` API, which is also only available on local commits.

#### Migration

**Before (deprecated):**

The `getRevertible` argument passed to the event had the following shape:

|               | Data change         | Schema change |
|---------------|---------------------|---------------|
| Local change  | `() => Revertible`  | `undefined`   |
| Remote change | `undefined`         | `undefined`   |

```typescript
checkout.events.on("changed", (_data, getRevertible) => {
	if (getRevertible !== undefined) {
		const revertible = getRevertible();
		// ...
	}
});
```

**After:**

The new `getRevertible` property has the following shape:

|               | Data change         | Schema change     |
|---------------|---------------------|-------------------|
| Local change  | `() => Revertible`  | `() => undefined` |
| Remote change | `undefined`         | `undefined`       |

```typescript
checkout.events.on("changed", ({ getRevertible }) => {
	const revertible = getRevertible?.();
	if (revertible !== undefined) {
		// ...
	}
});
```

This applies potentially anywhere you listen to `changed` (for example on `TreeViewAlpha.events`/`TreeBranchEvents`).
