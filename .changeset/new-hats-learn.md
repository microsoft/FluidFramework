---
"@fluidframework/core-interfaces": minor
"@fluidframework/tree": minor
---
---
"section": other
---

Relocating Events Library to `@fluidframework/core-interfaces` and `@fluid-internal/client-utils`

The events library's types and interfaces are moved to `@fluidframework/core-interfaces`, while its implementation is relocated to `@fluid-internal/client-utils`. There are no changes to how the events library is used; the relocation simply organizes the library into more appropriate packages. This change has no impact on external consumers of Fluid.
