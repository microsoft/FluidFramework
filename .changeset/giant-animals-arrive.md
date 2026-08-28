---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": fix
---
Preserve SharedTree's baseline format for historical runtime defaults

SharedTree now treats the historical `2.0.0-defaults` runtime setting as its 2.0 baseline
because SharedTree has no 1.x format behavior. This keeps its baseline codecs and summaries
selectable when the supported deployed-client floor advances in
[microsoft/FluidFramework#27460](https://github.com/microsoft/FluidFramework/issues/27460).
The selected formats do not change for currently supported inputs.
