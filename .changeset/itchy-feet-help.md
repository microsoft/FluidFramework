---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Make POJO mode TreeArrayNodes report the array constructor as their constructor

Make POJO mode TreeArrayNode's inherited `constructor` property report `Array` instead of the `TreeNodeSchema` class.
This is necessary to make `TreeArrayNode`s appear equal to arrays according to NodeJS's `assert.strict.deepEqual` in NodeJS 22.
