## 0.21 Breaking changes

- [supportsTags deprecated](#supportstags-deprecated)
- [IErrorBase.sequenceNumber deprecated](#IErrorBase.sequenceNumber-deprecated)

### supportsTags deprecated
We are deprecating use of supportsTags and instead going to handle tags directly at the loader/runtime boundary
via `IContainerContext`. Other than this boundary, all loggers can assume full support for tags on all telemetry events.
This will involve a change in `container-definitions`, which is packaged as part of the `build-common` release.

### IErrorBase.sequenceNumber deprecated
This field was used for logging and this was probably not the right abstraction for it to live in.
But practically speaking, the only places it was set have been updated to log not just sequenceNumber
but a large number of useful properties off the offending message, via `CreateProcessingError`.
