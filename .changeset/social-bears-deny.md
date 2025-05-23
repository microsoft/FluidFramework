---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Name collisions from structurally named schema now error

It is legal to have multiple [TreeNodeSchema](https://fluidframework.com/docs/api/fluid-framework/treenodeschema-typealias) with the same name so long as they are not used together in the same tree.
Using different schema with the same name when building otherwise identical [structurally named](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#schemafactory-remarks) in the same [SchemaFactory](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class) is not valid, however.
Previously doing this would not error, and instead return the first structurally named schema with that name.
Now this case throws an informative error:

```typescript
const factory = new SchemaFactory(undefined);
class Child1 extends factory.object("Child", {}) {}
class Child2 extends factory.object("Child", {}) {}

const a = factory.map(Child1);

// Throws a UsageError with the message:
// "Structurally named schema collision: two schema named "Array<["Child"]>" were defined with different input schema."
const b = factory.array(Child2);
```
