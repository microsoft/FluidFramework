---
"fluid-framework": minor
"__section": breaking
---
Container APIs use Fluid-owned collection types

The aggregated [`ReadonlyArrayNode`](https://fluidframework.com/docs/api/fluid-framework/readonlyarraynode-interface), [`TreeMapNode`](https://fluidframework.com/docs/api/fluid-framework/treemapnode-interface), [`TreeRecordNode`](https://fluidframework.com/docs/api/fluid-framework/treerecordnode-interface), [`IDirectory`](https://fluidframework.com/docs/api/fluid-framework/idirectory-interface), and [`ISharedMap`](https://fluidframework.com/docs/api/fluid-framework/isharedmap-interface) APIs now use Fluid-owned collection and iterator interfaces instead of TypeScript's built-in container types.
This prevents changes to TypeScript's standard library from introducing unintended requirements for Fluid implementations.

#### Migration

Most existing assignments remain structurally compatible.
Methods available only on newer built-in collection types are not available on Fluid containers.
