---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-utils": minor
"__section": fix
---
Fix createBlobPayloadPending default and future configMap version validation

`createBlobPayloadPending` is now enabled by default starting with `oldestSupportedClient >= 3.0.0` (it remains disabled by default for older clients).

Additionally, `getConfigForMinVersionForCollabIterable` no longer rejects configMap entries authored for a version later than the current package version. Previously, every configMap key was validated with the same upper-bound check as `oldestSupportedClient`/`minVersionForCollab`, which made it impossible to pre-author entries for a not-yet-released version (such as the `"3.0.0": true` entry added for `createBlobPayloadPending`) and broke calls to `getConfigsForMinVersionForCollab`/`ContainerRuntime.loadRuntime2` regardless of the requested version. The requested `oldestSupportedClient`/`minVersionForCollab` value is still validated and can never exceed the current package version, so a configMap entry for a future version simply won't be selected until the package version reaches it.
