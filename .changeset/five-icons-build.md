---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime-definitions": minor
"__section": feature
---
Expose whether a container runtime has staged changes

`IContainerRuntimeBase` now exposes `hasStagedChanges`, a boolean indicating whether there are any changes submitted while in Staging Mode (via `enterStagingMode`) that have not yet been discarded or committed. A new `hasStagedChangesChanged` event is emitted whenever this value changes.

This is distinct from `isDirty`: a container runtime can be dirty due to ordinary unacknowledged local changes without having any staged changes, and vice versa.

```typescript
containerRuntime.on("hasStagedChangesChanged", (hasStagedChanges) => {
	// update UI to reflect whether there are staged changes awaiting commit/discard
});

const hasStagedChanges = containerRuntime.hasStagedChanges;
```
