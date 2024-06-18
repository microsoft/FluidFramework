---
"@fluidframework/telemetry-utils": major
---

Update `MockLogger`'s `events` property to no longer be externally mutable.

BREAKING CHANGE.
If you depended on this mutability to implement some behavior, it is recommended that you create your own mock logger implementation.
If you depended on this mutability to work around the logger's self-clearing behavior after running a match check, you can now override this behavior via the `clearEventsAfterCheck` parameter.
