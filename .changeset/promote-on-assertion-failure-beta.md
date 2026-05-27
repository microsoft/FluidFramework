---
"@fluidframework/core-utils": minor
"fluid-framework": minor
"__section": feature
---
Promote `onAssertionFailure` to `@beta`

The `onAssertionFailure` hook, previously `@alpha`, has been promoted to `@beta`.
It allows registering a handler that is invoked when an assertion failure occurs, which is useful for capturing the first error in a sequence before subsequent failures obscure the root cause.

```typescript
import { onAssertionFailure } from "@fluidframework/core-utils/beta";

let firstAssertion: Error | undefined;
const unregister = onAssertionFailure((error) => {
	firstAssertion ??= error;
});
```
