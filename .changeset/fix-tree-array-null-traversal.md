---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
TreeArrayNodes correctly handle null elements during iteration and removal

Null elements in a [`TreeArrayNode`](https://fluidframework.com/docs/api/fluid-framework/treearraynode-interface) are now handled correctly during iteration and by the alpha `splice` method.
Previously, encountering a `null` element during iteration or removing one with `splice` incorrectly threw an out-of-bounds error.
