---
"@fluidframework/local-driver": major
---

local-driver: LocalDocumentStorageService class property type changes

The `repositoryUrl` property on the `LocalDocumentStorageService` class has changed from a property getter to a
`readonly` field. While this is an API change, there should be no changes required on the consumer side since calling
code should remain the same.
