---
"fluid-framework": minor
"@fluidframework/sequence": minor
---

SharedString now uses ISharedObjectKind and does not export the factory

Most users of `SharedString` should be unaffected as long as they stick to the factory patterns supported by ISharedObjectKind.
If the actual class type is needed it can be found as `SharedStringClass`.
