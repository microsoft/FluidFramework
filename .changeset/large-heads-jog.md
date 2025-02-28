---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Faster processing of events for large transactions

In versions prior to 2.3.0, event processing time could scale quadratically (`O(N^2)`) with the change count when
processing a batch of changes.

This performance characteristic has been corrected. See change
[#23908](https://github.com/microsoft/FluidFramework/pull/23908) for more details.
