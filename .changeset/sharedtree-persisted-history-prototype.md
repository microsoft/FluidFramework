---
"@fluidframework/tree": minor
"__section": tree
"__includeInReleaseNotes": false
---
Add an internal opt-in prototype for persisted SharedTree history configuration

SharedTree can create explicitly configured instances with `configuredSharedTree({}, { retainHistory: false })`.
The package-private kernel configuration facet can request full replacements such as `{ retainHistory: true }`.
Attached changes apply at a sequenced barrier; unattached changes apply locally without an op.
The persisted history boundary survives summaries and detached reloads.
Disabling resumes safe pruning without removing history required for collaboration, branches, or undo.
Legacy instances and factory options keep their existing behavior.

```typescript
const kind = configuredSharedTree({}, { retainHistory: false });
// In Tree's internal integration surface:
await tree.kernel.configuration?.requestChange({ retainHistory: true });
```
