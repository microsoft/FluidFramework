---
"@fluidframework/shared-object-base": minor
"__section": deprecation
---
Deprecate shared object implementation classes

`SharedObject` and `SharedObjectCore` from `@fluidframework/shared-object-base` are deprecated.
These classes will become internal in a future release.
Use existing distributed data structures instead of custom subclasses.
For types that do not need implementation details, use `ISharedObject` instead:

```typescript
import type { ISharedObject } from "@fluidframework/shared-object-base/legacy";

function getSharedObjectId(sharedObject: ISharedObject): string {
	return sharedObject.id;
}
```

See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691) for details.
