---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Export TreeNode not only as a type

`TreeNode` can now be used as a runtime object.
This enables checking if an object is a `TreeNode` with `instanceof`.
`TreeNode` has customized `instanceof` support so it can detect `TreeNode` instances, even if they hide their prototype like [POJO mode nodes](https://fluidframework.com/docs/api/fluid-framework/schemafactory-class#schemafactory-remarks) do.
