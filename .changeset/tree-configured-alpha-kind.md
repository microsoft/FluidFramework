---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Preserve alpha capabilities when configuring SharedTree kinds

[`configuredSharedTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/#configuredsharedtreealpha-function) now returns [`SharedObjectKindAlpha`](https://fluidframework.com/docs/api/shared-object-base/sharedobjectkindalpha-interface), matching the capabilities exposed by [`SharedTreeAlpha`](https://fluidframework.com/docs/api/fluid-framework/#sharedtreealpha-variable).
This exposes the [`type`](https://fluidframework.com/docs/api/driver-definitions/registrykey-interface#type-propertysignature) and [`adapt`](https://fluidframework.com/docs/api/driver-definitions/registrykey-interface#adapt-methodsignature) members needed to use configured kinds as registry keys.
Existing uses of the returned [`SharedObjectKind`](https://fluidframework.com/docs/api/shared-object-base/sharedobjectkind-interface) remain supported, and runtime behavior is unchanged.
