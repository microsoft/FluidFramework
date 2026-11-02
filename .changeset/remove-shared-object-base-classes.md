---
"@fluidframework/shared-object-base": minor
"__section": legacy
---
Remove support for the shared object base classes

`SharedObject` and `SharedObjectCore` are no longer supported exports of `@fluidframework/shared-object-base/legacy`.
The supported API at the root entry point also excludes these classes.
The implementations remain available through `/internal` for DDS implementations in this repository.
This does not change runtime behavior or stored data.

For shared object types, use `ISharedObject` or the interface of the specific DDS.
For example, replace a base-class type annotation with the supported interface:

```typescript
import type { ISharedObject } from "@fluidframework/shared-object-base/legacy";

function getSharedObjectId(value: ISharedObject): string {
	return value.id;
}
```

External subclassing of these classes is no longer supported.
There is no supported replacement base class.
Custom DDS implementations must implement the channel contracts without these base classes or remain on an earlier release.
Do not migrate application imports to `/internal`.

See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691).
