---
"@fluidframework/fluid-static": minor
"fluid-framework": minor
"__section": legacy
---
createTreeContainerRuntimeFactory accepts a MinimumVersionForCollab SemVer and deprecates minVersionForCollabOverride

The `compatibilityMode` property on `createTreeContainerRuntimeFactory` now accepts a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) SemVer string in addition to the legacy [`CompatibilityMode`](https://fluidframework.com/docs/api/fluid-static/compatibilitymode-typealias) values `"1"` and `"2"`.
When a SemVer is provided, `minVersionForCollabOverride` (now deprecated) is ignored.

```ts
// Before
createTreeContainerRuntimeFactory({
    // ...
    compatibilityMode: "2",
    minVersionForCollabOverride: "2.10.0",
});

// After
createTreeContainerRuntimeFactory({
    // ...
    compatibilityMode: "2.10.0",
});
```
