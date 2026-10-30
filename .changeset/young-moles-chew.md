---
"@fluid-experimental/tree": minor
"__section": legacy
---
Separate experimental tree creation from its implementation class

`SharedTree` now separates tree creation from the implementation class.
Its factory object creates trees through the factory registered with the data store runtime.
Because this creation path returns `ISharedTree`, you can use the tree without the implementation class.
The `SharedTree` type alias also refers to `ISharedTree`, so instance annotations can keep the same name.

```typescript
import { SharedTree } from "@fluid-experimental/tree";

const tree = SharedTree.create(runtime);
```

The returned interface also works with tree helpers, so you can pass `tree` directly to a checkout or transaction.
These helper calls and the `SharedTree.create(runtime, id)` call keep their previous syntax.

The registered factory still controls the write format and options.
`SharedTree.getFactory()` supplies the default factory, which uses write format 0.1.1.
If your code previously used `SharedTree.getFactory(writeFormat, options)`, replace that call with `new SharedTreeFactory(writeFormat, options)`.

Although the public `SharedTree` name no longer refers to a constructor, the package retains that constructor as `SharedTreeClass`.
If your code constructs or subclasses the implementation, use `SharedTreeClass` instead.
This class retains its protected members and supports `instanceof` checks.
For example, the following import keeps the implementation class under its previous local name:

```typescript
import { SharedTreeClass as SharedTree } from "@fluid-experimental/tree";
```

This separation changes TypeScript imports but does not change persisted data formats.
See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691) for the API cleanup context.
