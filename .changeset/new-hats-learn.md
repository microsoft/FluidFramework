---
"@fluidframework/core-interfaces": minor
"@fluidframework/tree": minor
---
---
"section": other
---

The events library has been moved from the tree package

The tree package contains an events library. The events library's types and interfaces have been moved to
`@fluidframework/core-interfaces`, while its implementation has been relocated to `@fluid-internal/client-utils`. There are
no changes to how the events library is used; the relocation simply organizes the library into more appropriate
packages. This change should have no impact on developers using the Fluid Framework.
