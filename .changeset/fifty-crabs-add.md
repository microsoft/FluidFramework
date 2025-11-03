---
"@fluidframework/tree": minor
"__section": feature
---
`delete` keyword support for ObjectNodes

Added support for using the `delete` keyword to remove content under optional fields for ObjectNodes.

```ts
// This is now equivalent to node.foo = undefined
delete node.foo
```
