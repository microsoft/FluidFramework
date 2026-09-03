---
"@fluidframework/container-loader": minor
"__section": fix
---

Close containers when the current connection's self-join predates the loaded state

The loader now detects when a write connection's `ClientJoin` operation has a sequence number at or below the immutable sequence baseline captured for that connection. This incompatible-history condition closes the container with a non-retryable `fileOverwrittenInStorage` error instead of silently discarding the join as duplicate delivery.
