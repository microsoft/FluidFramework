---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Prevent array content corruption in the optimized SharedTree forest

This issue only affects applications configured to use [`ForestTypeOptimized`](https://fluidframework.com/docs/api/tree#foresttypeoptimized-variable).
In some specific cases, editing an array with multiple children could replace an incorrect portion of the array's children.
Among other corruption, this could cause the internally stored and summarized array to be shorter than it is supposed to be,
leading to the potential for out-of-bounds indexes in future or concurrent edits.
This could cause silent data loss from the array and exceptions when processing edits.
This includes processing trailing ops when loading a corrupted document, which could cause a crash on load.
One of the asserts this could hit is `0xcf9`, but it could hit others as well, especially if loading a corrupted document with a different [ForestType](https://fluidframework.com/docs/api/tree/foresttype-interface).

The optimized forest now updates the intended array element and validates tree transfers before mutating document state.
Additional assertions detect inconsistent forest operations earlier and provide more actionable failures when triaging similar issues in the future.
