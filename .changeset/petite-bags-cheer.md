---
"@fluidframework/tree": minor
---
---
"section": tree
---

Improve tree shaking for code which imports `SharedTreeAttributes`

Production Webpack bundles of code importing `SharedTreeAttributes` from `@fluidframework/tree/legacy` should now better prune out the rest of the tree package's code.
This change reduced the dependency on webpack's [`usedExports`](https://webpack.js.org/configuration/optimization/#optimizationusedexports) when tree shaking in this case.
Other bundlers will likely be impacted similarly.
