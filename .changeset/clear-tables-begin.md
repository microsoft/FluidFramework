---
"@fluid-experimental/tree": minor
"__section": legacy
---
Use the complete experimental tree interface instead of the implementation class

`SharedTree` is now a creation value and a type alias for the new `ISharedTree` interface. Direct construction and inheritance from `SharedTree` are no longer supported. Use `SharedTree.create(runtime)` or `SharedTree.getFactory()` instead of the implementation constructor. The factory overloads retain their write-format options.

```typescript
import { SharedTree, WriteFormat, type ISharedTree } from "@fluid-experimental/tree";

const tree: ISharedTree = SharedTree.create(runtime);
const factory = SharedTree.getFactory(WriteFormat.v0_1_1, undefined);
```

The interface retains typed handles, events, ID conversions, edits, `currentView`, `applyEdit`, and `revert`. History remains available through `edits` and `logViewer`, including both `getRevisionViewInMemory` and deprecated `getRevisionViewInSession`.

Checkouts, transactions, undo handlers, and migration shims accept the interface, but implementation state and general event emission remain internal. This change preserves runtime behavior and persisted data formats. It does not replace this DDS with modern `@fluidframework/tree`. See [issue #26691](https://github.com/microsoft/FluidFramework/issues/26691).
