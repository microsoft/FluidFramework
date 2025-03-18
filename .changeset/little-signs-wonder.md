---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
"section": tree
---

Alpha APIs for replacing handles in export formats have been redesigned

The various import and export [`VerboseTree`](https://fluidframework.com/docs/api/fluid-framework/verbosetree-typealias) and [`ConciseTree`](https://fluidframework.com/docs/api/fluid-framework/concisetree-typealias) APIs no longer include `valueConverter` options.
Instead the resulting tree can be further processed to do any desired replacements.
The following `@alpha` APIs have been added to assist with this:

1. `cloneWithReplacements`
2. `replaceHandles`
3. `replaceConciseTreeHandles`
4. `replaceVerboseTreeHandles`
