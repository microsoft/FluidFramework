---
"@fluidframework/container-loader": minor
"__section": feature
---
Full container state capture can now be canceled

`ICaptureFullContainerStateProps` now accepts an optional `abortSignal`.
Callers can use it to cancel `captureFullContainerState` if the delta stream cannot connect or catch up.
