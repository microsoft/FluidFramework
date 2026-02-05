---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix false positive error from FormatValidator

Users of the alpha API [FormatValidatorBasic](https://fluidframework.com/docs/api/fluid-framework/#formatvalidatorbasic-variable)
could hit an exception when parsing data where the result of evaluating "[MinimumVersionForCollab](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) \< 2.74.0"
differed between the client encoding the data and the one decoding it.
For example opening an old document with a new client setting `MinimumVersionForCollab = 2.74.0` could hit this error.
This has been fixed, and such cases will no longer error.
