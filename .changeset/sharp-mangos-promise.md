---
"@fluidframework/test-end-to-end-tests": minor
"@fluidframework/container-runtime": minor
"@fluid-internal/tree": minor
---

Op compression is enabled by default

If the size of a batch is larger than 614kb, the ops will be compressed. After upgrading to this version, if batches exceed the size threshold, the runtime will produce a new type of op with the compression properties. To open a document which contains this type of op, the client's runtime version needs to be at least `client_v2.0.0-internal.2.3.0`. Older clients will close with assert `0x3ce` ("Runtime message of unknown type") and will not be able to open the documents until they upgrade. To minimize the risk, it is recommended to audit existing session and ensure that at least 99.9% of them are using a runtime version equal or greater than `client_v2.0.0-internal.2.3.0`, before upgrading to `2.0.0-internal.4.1.0`.

More information about op compression can be found
[here](./packages/runtime/container-runtime/src/opLifecycle/README.md).
