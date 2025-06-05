---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
TreeAlpha.create now accepts unhydrated nodes

[TreeAlpha.create](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#create-methodsignature) now accepts [unhydrated](https://fluidframework.com/docs/api/fluid-framework/unhydrated-typealias) nodes.
`TreeAlpha.create`'s documentation has been fixed to indicate support instead of being self contradictory about it.

Additionally `TreeAlpha.create` no longer throws a "Tree does not conform to schema" error when given a tree omitting an identifier.
Instead the identifier behaves like it would for other ways to build unhydrated nodes: remaining unreadable until hydrated.
