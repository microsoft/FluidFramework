---
"@fluidframework/telemetry-utils": major
---

telemetry-utils: BREAKING CHANGE: Update MockLogger's events property is no longer externally mutable

If you depended on this mutability to implement some behavior, you should create your own mock logger implementation.

If you depended on this mutability to work around the logger's self-clearing behavior after running a match check, you
can now override this behavior via the `clearEventsAfterCheck` parameter.
