---
"@fluidframework/driver-definitions": minor
"@fluidframework/local-driver": minor
"fluid-framework": minor
"__section": feature
---
Simplify creating attached Fluid containers with ServiceClient

Added `ServiceClient.createAttachedContainer` which creates and attaches a Fluid container in one operation.
It is a convenient shorthand for calling `createContainer` followed by `attach` when detached-container access is not needed.

```typescript
const container = await client.createAttachedContainer(dataStoreKind);
```
