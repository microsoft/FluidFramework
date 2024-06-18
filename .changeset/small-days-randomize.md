---
"@fluidframework/telemetry-utils": minor
---

Deprecate `MockLogger` for external use.

No replacement API is given. This type was never intended for use outside of the `fluid-framework` repository.
If you were depending on this class for testing purposes, we recommend creating your own mock logger implementation,
or copy and adapt the code from `fluid-framework` as needed.
