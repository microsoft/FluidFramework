---
"@fluidframework/core-utils": minor
"__section": deprecation
---
Deprecate assert

The legacy `assert` API is intended only for use within the Fluid Framework client codebase and is now deprecated for external consumers.
Consumers should replace it with an assertion utility appropriate for their application.

The API is scheduled for removal in version 3.10.0.
For more information, see [issue #28084](https://github.com/microsoft/FluidFramework/issues/28084).
