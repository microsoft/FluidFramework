---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
"__includeInReleaseNotes": false
---
Add an internal opt-in prototype for persisted SharedTree history configuration

SharedTree can create explicitly configured instances with `configuredSharedTree({}, { retainHistory: false })`.
The package-private kernel configuration facet can request full replacements such as `{ retainHistory: true }`.
Attached changes apply at a sequenced barrier; unattached changes apply locally without an op.
Enabling waits for the next committed main-trunk change, whose existing revision becomes the retained history start.
The edit-manager summary stores that optional revision reference; a summary made before the first change reloads still waiting.
Repeated enabled configuration does not reset the start; disabling and re-enabling waits for a new first commit.
Disabling resumes safe pruning without removing history required for collaboration, branches, or undo.
This replaces the alpha `SharedTreeOptions.retainHistory` option.
Use the second factory argument for initial persisted settings, rather than a local factory flag.
Unconfigured instances use normal bounded retention, and stable existing summaries remain readable.

```typescript
const kind = configuredSharedTree({}, { retainHistory: false });
// In Tree's internal integration surface:
await tree.kernel.configuration?.requestChange({ retainHistory: true });
```
