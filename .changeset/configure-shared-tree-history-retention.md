---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Configure how much SharedTree edit history to retain

The alpha SharedTree configuration accepts a `historyRetention` option.
Pass a nonnegative safe integer to retain the newest specified number of available sequenced main-branch commits, `true` to retain all available history, or `false` or zero to disable extra retention.

```typescript
import { configuredSharedTree } from "fluid-framework/alpha";

const SharedTree = configuredSharedTree({ historyRetention: 20 });
```

Collaboration and existing branches can require retaining more commits than the configured number.
After loading a summary, trimming waits for the collaboration boundary to be reported.
The count applies to sequenced commits, not file versions or snapshots.
The policy is local to each SharedTree instance and is not persisted or sent to other clients.
History that has already been removed cannot be recovered by increasing retention.

The existing `retainHistory` boolean remains supported.
When both options are supplied, `historyRetention` takes precedence, including explicit `false` and zero values.
