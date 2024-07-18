---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Improved error reporting

Several cases invalid usage patterns for tree APIs have gained improved error reporting, as well as improved documentation on the APIs detailing what usage is supported.
These improvements include:

-   Unsupported usages of schema classes: using more than one schema class derived from a single SchemaFactor generated base class. This use to hit internal asserts, but now has a descriptive user facing UsageError. Most of this work was done in [9fb3dcf](https://github.com/microsoft/FluidFramework/commit/9fb3dcf491a7f0d66f4abbdc64ab97ccabef4707).

-   Improved detection of when prior exception may have left SharedTree in an invalid state.
These cases now report a UsageError including a reference to the prior exception. This was mainly done in [9fb3dcf](https://github.com/microsoft/FluidFramework/commit/9fb3dcf491a7f0d66f4abbdc64ab97ccabef4707) and [b77d530](https://github.com/microsoft/FluidFramework/commit/b77d530b9252201c40a90d1a2a6315f76f1a4a4b).
