---
"@fluidframework/container-definitions": major
---

Remove `prepareSend` and `submitOp` `DeltaManager` events, which have been long deprecated.

No replacement APIs recommended.
These events were never intended for use outside of `fluid-framework`, and have been marked as deprecated for more than 18 months.
