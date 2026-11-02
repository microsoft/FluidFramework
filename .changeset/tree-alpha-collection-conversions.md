---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Preserve array and map node types when accessing alpha APIs

Calling [`asAlpha`](https://fluidframework.com/docs/api/fluid-framework#asalpha-function) on an array or map node now preserves its read and insertion types, customized subclass members, and schema identity.
The additional alpha methods use the node's existing read and insertion types, so valid content remains accepted and invalid content remains rejected.

Omit the type arguments to preserve the complete node type automatically.
If you already specify the allowed types explicitly, that call remains supported, but it does not preserve customized members in the returned type.
Specify the node type as the second type argument to preserve those members too.

```typescript
import { asAlpha, SchemaFactory } from "fluid-framework/alpha";

const sf = new SchemaFactory("example");
class Numbers extends sf.array("Numbers", sf.number) {
	public label = "numbers";
}
const numbers = new Numbers([1, 2]);

// Recommended: infer the element type and preserve the custom label property.
const inferred = asAlpha(numbers);
inferred.unshift(0);
inferred.label; // string

// An explicit allowed-types argument still supports numeric array operations.
const explicit = asAlpha<typeof sf.number>(numbers);
explicit.unshift(3);

// Also specify the node type to preserve the custom label property.
const explicitNode = asAlpha<typeof sf.number, Numbers>(numbers);
explicitNode.label; // string
```

The same type-argument guidance applies to map nodes.
The conversion still returns the original node without changing runtime behavior.
