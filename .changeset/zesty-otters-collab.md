---
"@fluidframework/fluid-static": minor
"fluid-framework": minor
"__section": legacy
---
`createTreeContainerRuntimeFactory` no longer accepts `minVersionForCollabOverride`

The `minVersionForCollabOverride` property on the `props` argument of `createTreeContainerRuntimeFactory` has been removed.

Pass a [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) semver string (for example `"2.10.0"`) directly via the `compatibilityMode` property instead. `compatibilityMode` now accepts either a `MinimumVersionForCollab` semver string or the existing (deprecated) `CompatibilityMode` values `"1"` / `"2"`.

Before:

```ts
createTreeContainerRuntimeFactory({
    schema,
    compatibilityMode: "2",
    minVersionForCollabOverride: "2.10.0",
});
```

After:

```ts
createTreeContainerRuntimeFactory({
    schema,
    compatibilityMode: "2.10.0",
});
```
