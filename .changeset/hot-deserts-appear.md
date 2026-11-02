---
"@fluidframework/core-utils": minor
"__section": legacy
---
Remove the deprecated beta assert API

The deprecated `assert` API is removed from the external entry points of `@fluidframework/core-utils` in version 3.10.0.
Use an assertion utility appropriate for your application or throw an `Error` directly.
The internal API remains available for Fluid Framework repository code and is not supported for external use.

```typescript
// Before
import { assert } from "@fluidframework/core-utils/legacy";

assert(value !== undefined, "Expected a value");

// After
if (value === undefined) {
	throw new Error("Expected a value");
}
```

See [the removal tracking issue](https://github.com/microsoft/FluidFramework/issues/28084) for context.
