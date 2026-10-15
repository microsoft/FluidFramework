---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add explicit, tree-shakable SharedTree feature selection

Most applications do not need to make a change.
Existing SharedTree factories continue to include history recovery by default and preserve their current behavior.

Applications that do not use undo, redo, revertibles, or historical-revision recovery can now exclude that implementation from their bundle.
Use `configuredSharedTreeWithFeaturesAlpha` and omit `revertibleSupport`:

```typescript
import { configuredSharedTreeWithFeaturesAlpha } from "@fluidframework/tree/alpha";

const SharedTree = configuredSharedTreeWithFeaturesAlpha();
```

The APIs are also available from `fluid-framework/alpha`.

Before disabling history recovery, search the application for:

- `getRevertible` calls in SharedTree change events.
- `Revertible` objects or application-managed undo and redo stacks.
- Calls to `revertTo` or `rewindTo`.
- Existing `revertibleSupport` configuration.

If the application uses any of these capabilities, it should keep history recovery enabled.
No migration is required, or the application can make its selection explicit:

```typescript
import {
	configuredSharedTreeWithFeaturesAlpha,
	RevertibleSupportEnabled,
} from "@fluidframework/tree/alpha";

const SharedTree = configuredSharedTreeWithFeaturesAlpha({
	revertibleSupport: RevertibleSupportEnabled,
});
```

When history recovery is disabled:

- Normal editing, collaboration, transactions, branching, and rebasing continue to work.
- Changed events continue to fire, but do not provide a revertible factory.
- Commit metadata does not provide its optional `revertTo` function.
- Explicit `revertTo` and `rewindTo` calls throw a `UsageError`.
- Enabled history-recovery code can be removed from the application bundle.

Passing `RevertibleSupportDisabled` to `configuredSharedTreeAlpha` removes runtime history-recovery state and processing, but does not guarantee bundle-size reduction.
That factory imports `RevertibleSupportEnabled` as its backward-compatible default, which keeps the enabled implementation reachable.
Applications that require tree-shaking must use `configuredSharedTreeWithFeaturesAlpha`.

The explicit factory uses lightweight disabled implementations for omitted features and does not import enabled implementations.
Applications pass only the enabled providers they need.
Future optional features can use the same provider-injection pattern without adding a separate factory for every feature combination.
