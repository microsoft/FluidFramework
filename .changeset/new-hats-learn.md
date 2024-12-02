---
"@fluidframework/core-interfaces": minor
"@fluidframework/tree": minor
"@fluid-internal/client-utils": minor
---
---
"section": other

# Since this doesn't affect external users of the framework, exclude from the release notes but
# include in the per-package changelogs.
"includeInReleaseNotes": false
---

The events library has been moved from the tree package

In previous releases, the `@fluidframework/tree` package contained an internal events library. The events-related types and interfaces have been moved to
`@fluidframework/core-interfaces`, while the implementation has been relocated to `@fluid-internal/client-utils`. There are
no changes to how the events library is used; the relocation simply organizes the library into more appropriate
packages. This change should have no impact on developers using the Fluid Framework.
