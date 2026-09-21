---
"fluid-framework": minor
"__section": fix
---
Use configured SharedTree kinds in service client registries

The alpha [configuredSharedTree](https://fluidframework.com/docs/api/fluid-framework/#configuredsharedtree-function) function in fluid-framework now returns [SharedObjectKindAlpha\<ITree\>](https://fluidframework.com/docs/api/shared-object-base/sharedobjectkindalpha-interface) instead of [SharedObjectKind\<ITree\>](https://fluidframework.com/docs/api/shared-object-base/sharedobjectkind-interface).
This exposes the registry capabilities already provided by the returned object, so applications can use it with [sharedObjectRegistryFromIterable](https://fluidframework.com/docs/api/fluid-framework/#sharedobjectregistryfromiterable-function) and [instantiateTreeFirstTime](https://fluidframework.com/docs/api/fluid-framework/#instantiatetreefirsttime-function) without an internal import.
Existing uses of the returned `SharedObjectKind<ITree>` remain supported, and runtime behavior is unchanged.

```typescript
import {
	configuredSharedTree,
	sharedObjectRegistryFromIterable,
} from "fluid-framework/alpha";

const treeKind = configuredSharedTree({});
const registry = sharedObjectRegistryFromIterable([treeKind]);
```
