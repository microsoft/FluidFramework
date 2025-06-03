---
"@fluidframework/shared-object-base": minor
"__section": legacy
---
Added an optional boolean parameter `fullTree` to `SharedObject`'s `summarizeCore` method

This parameter tells the shared object that it should generate a full tree summary, i.e., it must not summarize incrementally.
Currently, none of the shared object's do incremental summaries. However, if one decides to do it, it needs to take "fullTree" parameter into consideration.
