---
"@fluidframework/test-runtime-utils": major
---

MockDeltaManager class property type changes

The `active` and `maxMessageSize` properties on the `MockDeltaManager` class have changed from property getters to
`readonly` fields. While this is an API change, there should be no changes required on the consumer side since calling
code should remain the same.
