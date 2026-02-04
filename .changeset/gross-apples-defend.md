---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Promote MinimumVersionForCollab to beta

Promotes the [MinimumVersionForCollab](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) type to beta, and adds option to [configuredSharedTreeBeta](https://fluidframework.com/docs/api/fluid-framework#configuredsharedtreebeta-function) for specifying it when creating a new `SharedTree`.

This allows users to opt into new features and optimizations that are only available when certain minimum version thresholds are guaranteed.
For more details, see [FluidClientVersion](https://fluidframework.com/docs/api/fluid-framework#fluidclientversion-variable)

#### Example usage

```typescript
// Configure SharedTree DDS to limit the features it requires of collaborators and future document users to only those available in version `2.80.0` and later, overriding the `MinimumVersionForCollab` provided by the runtime (default: "2.0.0").
// Edits made to this DDS by this client might cause clients older than the specified version to be unable to open the document and/or error out of collaboration sessions.
const SharedTree = configuredSharedTreeBeta({
	minVersionForCollab: FluidClientVersion.v2_80,
});
```
