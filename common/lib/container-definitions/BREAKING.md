## 0.40 Breaking changes

- [IErrorBase.sequenceNumber removed](#IErrorBase.sequenceNumber-removed)

### IErrorBase.sequenceNumber removed
This field was used for logging and this was probably not the right abstraction for it to live in.
But practically speaking, the only places it was set have been updated to log not just sequenceNumber
but a large number of useful properties off the offending message, via `CreateProcessingError`.
