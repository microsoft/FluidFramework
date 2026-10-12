---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add a tree-shakable SharedTree factory without history recovery

Applications that do not use undo, redo, or historical-revision recovery can now use
`configuredSharedTreeWithoutHistoryAlpha` to exclude that feature's implementation from their bundle.
Changed events continue to fire, but do not provide revertible factories, and explicit history-recovery
operations throw a `UsageError`.

```typescript
import { configuredSharedTreeWithoutHistoryAlpha } from "@fluidframework/tree/alpha";

const SharedTreeWithoutHistory = configuredSharedTreeWithoutHistoryAlpha();
```
