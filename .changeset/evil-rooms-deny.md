---
"@fluidframework/map": major
"@fluidframework/sequence": major
"@fluidframework/test-runtime-utils": major
---

`MockContainerRuntime` has two new required methods, `flush()` and `rebase()`. `MockFluidDataStoreRuntime` has one new required method, `createDeltaConnection`.

To enable testing scenarios involving batches of ops, `MockContainerRuntime` has two new required methods, `flush()` and `rebase()`. Depending on the `IMockContainerRuntimeOptions` supplied to the mock runtime, these two new methods must be used accordingly. For the same reason, `MockFluidDataStoreRuntime` implements the `createDeltaConnection` method, along with managing the mock delta connection lifecycle in a single place.
