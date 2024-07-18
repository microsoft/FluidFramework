---
"@fluidframework/tree": minor
"fluid-framework": minor
---

Detect arrayNode iterator invalidation

This change updates the behavior of array nodes such that when we concurrently edit the array during iteration, it will throw an error.
