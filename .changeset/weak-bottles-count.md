---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Improved Schema Validation

When constructing a [`TreeViewConfiguration`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class), more invalid cases are reported as errors:

1. The same schema listed more than once in a given [`AllowedTypes`](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) is now an error even when [`preventAmbiguity`](https://fluidframework.com/docs/api/fluid-framework/treeviewconfiguration-class#preventambiguity-property) is false.
2. Multiple schema with the same identifier reachable from the root is now detected as an error.
