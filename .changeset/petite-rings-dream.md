---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add TreeBeta.create

Adds `TreeBeta.create`, which is a more stable version of the existing [`TreeAlpha.create`](https://fluidframework.com/docs/api/tree/treealpha-interface#create-methodsignature).
The only difference is the new `TreeBeta.create` does not support the `@alpha` [`UnsafeUnknownSchema`](https://fluidframework.com/docs/api/tree/unsafeunknownschema-typealias) option.
