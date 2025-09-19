---
"@fluidframework/telemetry-utils": minor
"__section": legacy
---
Wrapped errors preserved as `cause` property

`IFluidErrorBase` (internal basis for FluidFramework client errors) declares `cause` property matching ES2022 lib (whether targeted or not). When an error is wrapped, `cause` will be set to the originating error (which may or may not itself be an `Error`).
