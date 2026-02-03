---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": feature
---
Promote MinimumVersionForCollab to beta

Promotes the [MinimumVersionForCollab](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) type to beta, and adds option to [configuredSharedTreeBeta](https://fluidframework.com/docs/api/fluid-framework#configuredsharedtreebeta-function) for specifying it when creating a new `SharedTree`.

This allows users to opt into new features and optimizations that are only available to newer clients.

#### Example usage

```typescript
// Configure SharedTree DDS to limit the features it requires of collaborators and future document users to only those available in version `2.80.0` and later, overriding the `MinimumVersionForCollab` provided by the runtime (default: "2.0.0").
// Edits made to this DDS by a client on an earlier version will fail, preventing potential  document corruption.
const SharedTree = configuredSharedTreeBeta({
	minVersionForCollab: "2.80.0",
});
```
