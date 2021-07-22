## Breaking changes to expect in upcoming releases

- [IErrorBase.sequenceNumber to be removed](#IErrorBase.sequenceNumber-to-be-removed)

### IErrorBase.sequenceNumber to be removed
This field was used for logging and this was probably not the right abstraction for it to live in.
But practically speaking, the only places it was set have been updated to log not just sequenceNumber
but a large number of useful properties off the offending message, via `CreateProcessingError`.

This property will be __deprecated__ in 0.39.7, and will be __deleted__ in the 0.40 release
