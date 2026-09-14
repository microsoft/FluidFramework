---
"@fluidframework/container-runtime": minor
"__section": feature
---
Identify pending local state that can safely be reused

The new `isPendingLocalStateReusable` helper conservatively identifies pending local state that
contains no pending runtime state and can therefore be used to load multiple containers.

```typescript
import { isPendingLocalStateReusable } from "@fluidframework/container-runtime/legacy";

const pendingLocalState = await container.getPendingLocalState();
if (isPendingLocalStateReusable(pendingLocalState)) {
	// The state can safely initialize more than one container.
}
```
