---
"@fluidframework/tree": minor
"__section": tree
---

Improve Tree Shaking For Code Which Imports `SharedTreeAttributes`

Bundling code that imports `SharedTreeAttributes` from `@fluidframework/tree/legacy` should now better prune out the rest of the tree package's code.
This change reduced the dependency on webpack's
[`usedExports`](https://webpack.js.org/configuration/optimization/#optimizationusedexports) when tree shaking, but other
bundlers should also benefit.
