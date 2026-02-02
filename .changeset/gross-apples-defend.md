---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Promote MinimumVersionForCollab to beta

Promotes the [MinumumVersionForCollab](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) type to beta, and adds option to [configuredSharedTreeBeta](https://fluidframework.com/docs/api/fluid-framework#configuredsharedtreebeta-function) for specifying it when creating a new `SharedTree`.

This allows users to opt into new features and optimizations that are only available when certain minimum version thresholds are guaranteed.
For more details, see [FluidClientVersion](https://fluidframework.com/docs/api/fluid-framework#fluidclientversion-variable)

#### Example usage

```typescript
// Configure SharedTree DDS to ensure all clients must be on at least version `2.80.0` in order to collaborate.
// Edits made to this DDS by a client on an earlier version will fail, preventing potential  document corruption.
const SharedTree = configuredSharedTreeBeta({
	minVersionForCollab: FluidClientVersion.v2_80,
});
```
