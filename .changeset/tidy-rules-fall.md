---
"@fluidframework/counter": minor
---

SharedCounter now uses ISharedObjectKind and does not export the class

Most users of `SharedCounter` should be unaffected as long as the stick to the factory patterns supported by ISharedObjectKind.
