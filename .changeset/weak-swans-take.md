---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Improved error reporting

Several cases invalid usage patterns for tree APIs have gained improved error reporting, as well as improved documentation on the APIs detailing what usage is supported.
These improvements include:

-   Unsupported usages of schema classes: using more than one schema class derived from a single SchemaFactor generated base class. This use to hit internal asserts, but now has a descriptive user facing UsageError.

-   Improved detection of when prior exception may have left SharedTree in an invalid state.
These cases now report a UsageError including a reference to the prior exception.
