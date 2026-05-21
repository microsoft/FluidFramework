---
"@fluidframework/fluid-static": minor
"fluid-framework": minor
"__section": legacy
---
createTreeContainerRuntimeFactory accepts a MinimumVersionForCollab SemVer and deprecates compatibilityMode with minVersionForCollabOverride

A `minVersionForCollaboration` property on `createTreeContainerRuntimeFactory` accepts a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) SemVer string and replaces `compatibilityMode` ([`CompatibilityMode`](https://fluidframework.com/docs/api/fluid-static/compatibilitymode-typealias) values `"1"` and `"2"`) with optional `minVersionForCollabOverride`.

See [issue #27356](https://github.com/microsoft/FluidFramework/issues/27356) for migration details and removal tracking.
