---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
`createTreeIndex` now interprets object field selectors as property keys

`createTreeIndex` previously interpreted keys returned by `TreeIndexKeyFieldSelector` as stored keys. This was inconsistent with the Simple Tree schema API and caused indexes to fail when an object field's property key differed from its stored key. Object field selectors are now translated from property keys to stored keys internally. Selectors must return `undefined` for non-object schemas.
