---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix false positive error from FormatValidator

Users of the alpha API [FormatValidatorBasic](https://fluidframework.com/docs/api/fluid-framework/#formatvalidatorbasic-variable)
could hit an "Invalid JSON." error when parsing data.
This would occur where the result of evaluating "[MinimumVersionForCollab](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) \< 2.74.0"
differed between the client encoding the data and the client decoding it.
For example opening an old document with a new client that sets `MinimumVersionForCollab = 2.74.0` would throw this error.
This has been fixed: this case will no longer throw.
