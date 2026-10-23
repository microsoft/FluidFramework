---
"@fluidframework/shared-object-base": minor
"@fluid-experimental/tree": minor
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

The `SharedTree` implementation class from `@fluid-experimental/tree` is also deprecated.
This class will be removed from the package's exports in a future release.
A replacement interface for this experimental tree is not yet available.
This notice does not apply to `SharedTree` from `@fluidframework/tree`.

See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691) for details.
