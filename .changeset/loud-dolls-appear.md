---
"@fluidframework/shared-object-base": minor
"__section": legacy
---
Added an optional boolean parameter "fullTree" to SharedObject's summarizeCore method

This parameter tells the shared object that it should generate a full tree summary, i.e., it must not summarize incrementally.
Currently no known `SharedObject`'s do incremental summaries; however, any that do exist or are made in the future must take this "fullTree" parameter into consideration to function correctly.
