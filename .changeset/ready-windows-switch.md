---
"@fluidframework/container-runtime": minor
---
---
section: deprecation
---

InactiveResponseHeaderKey header is deprecated

The header `InactiveResponseHeaderKey` is deprecated and will be removed in the future. It was part of an experimental feature where loading an inactive data store would result in returning a 404 with this header set to true. This feature is no longer supported.
