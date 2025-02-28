---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Faster processing of events for large transactions

[This PR](https://github.com/microsoft/FluidFramework/pull/23908) avoids the event processing time scaling quadratically with the change count when processing a batch of changes.
