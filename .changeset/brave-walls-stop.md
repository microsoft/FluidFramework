---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Create an independent TreeView with beta APIs

The new [`createIndependentTreeView`](https://fluidframework.com/docs/api/tree#createindependenttreeview-function) function creates a non-collaborative [`TreeViewBeta`](https://fluidframework.com/docs/api/tree/treeviewbeta-interface) directly from a [`TreeViewConfiguration`](https://fluidframework.com/docs/api/tree/treeviewconfiguration-class).
Use this function for local data or tests that need beta view APIs without a Fluid container.

```typescript
import {
	createIndependentTreeView,
	SchemaFactory,
	TreeViewConfiguration,
} from "@fluidframework/tree/beta";

const view = createIndependentTreeView(
	new TreeViewConfiguration({ schema: SchemaFactory.number }),
);
view.initialize(42);
```
