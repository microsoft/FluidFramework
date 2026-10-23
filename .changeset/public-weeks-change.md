---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Slightly faster SharedTree initialization

[`TreeView.initialize()`](https://fluidframework.com/docs/api/fluid-framework/treeview-interface#initialize-methodsignature) is now slightly faster for large schemas when debug-only checks are disabled or optimized out.
See [non-production conditional code](https://fluidframework.com/docs/api/core-utils/#nonproductionconditionalsincluded-function) for details on how bundlers remove these checks from production builds.

For a synthetic schema with **240 object types and 1,200 fields** (five fields per object type), plus an array root allowing all 240 types, warm initialization took about 7% less time in a local benchmark:

| Measurement | Before | After |
| --- | --- | --- |
| `TreeView.initialize([])` | 5.21 ms | 4.83 ms |

The tree was initialized with an empty array: these numbers measure schema-related initialization work, not loading 240 objects.
Measurements used Node.js with debug-only checks disabled and exclude view creation.
Results depend on the schema and environment.
