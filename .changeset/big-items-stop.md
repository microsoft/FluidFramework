---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
`formatVersion` removed from the options passed to `configuredSharedTree`

Note: this change may break users of alpha APIs. See below for details.

`SharedTreeOptions` (which is passed to `configuredSharedTree`) no longer includes a `formatVersion: SharedTreeFormatVersion[keyof SharedTreeFormatVersion]` field.
The concept of `SharedTreeFormatVersion` has been removed altogether.
Instead, users are expected to leverage the already existing `minVersionForCollab` field.

For migration purposes, the mapping from `SharedTreeFormatVersion` to `minVersionForCollab` is as follows:
* `SharedTreeFormatVersion.v1`: no supported equivalent
* `SharedTreeFormatVersion.v2`: no supported equivalent
* `SharedTreeFormatVersion.v3`: `minVersionForCollab: FluidClientVersion.v2_0`
* `SharedTreeFormatVersion.v5`: `minVersionForCollab: FluidClientVersion.v2_43`
* `SharedTreeFormatVersion.vSharedBranches`: `minVersionForCollab: FluidClientVersion.v2_43` + `SharedTreeOptions.enableSharedBranches`

The values for which there is no supported equivalent `minVersionForCollab` were never given official support.
[Contact](https://github.com/microsoft/FluidFramework/issues) the Fluid Framework team if you need help migrating away from them.
