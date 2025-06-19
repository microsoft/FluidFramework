---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Improved Schema Validation

When constructing a [`TreeViewConfiguration`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class), the same schema listed more than once in a given [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) is now an error even when [`preventAmbiguity`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class#preventambiguity-property) is false.
Previously a bug resulted in this only being rejected when `preventAmbiguity` was true.
