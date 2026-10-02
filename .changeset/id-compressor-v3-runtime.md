---
"@fluidframework/container-runtime": minor
"fluid-framework": minor
"__section": feature
---
Select ID compressor serialization V3 with an oldest supported client of 3.4.0

When the ID compressor is enabled, you can select its V3 serialization format by setting `oldestSupportedClient` to `"3.4.0"` or later when loading the container runtime.
This applies to new compressors and to compressors restored from summaries or pending local state.
The deprecated `minVersionForCollab` option selects the same format.

Earlier compatibility versions, including the default when you omit the setting, continue to select V2.
This change does not enable the ID compressor if it is disabled.

Before raising the oldest supported client version, ensure that all clients that must read the document are on at least Fluid Framework client version `3.4.0`.
Clients that only support V2 cannot read V3 state.
Lowering the setting afterward does not convert existing V3 state back to V2.
