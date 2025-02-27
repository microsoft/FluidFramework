---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Invalid schema base classes in `Tree.is` now throw an error instead of returning `false`
As documented in [`TreeNodeSchemaClass`](https://fluidframework.com/docs/api/fluid-framework/treenodeschemaclass-typealias#treenodeschemaclass-remarks), there are specific rules around sub-classing schema, mainly that only a single most derived class can be used.
One place where it was easy to accidentally violate this rule and get hard-to-debug results was [`Tree.is`](https://fluidframework.com/docs/data-structures/tree/nodes#treeis).
This has been mitigated by adding a check in `Tree.is` which detects this mistake (which used to result in `false` being returned) and instead throws a `UsageError` explaining the situation.
The error will look something like:

> Two schema classes were used (CustomObjectNode and Derived) which derived from the same SchemaFactory generated class ("com.example.Test"). This is invalid.

For applications wanting to test if a given `TreeNode` is an instance of some schema base class, this can be done using `instanceof` which includes base base classes when doing the check.
