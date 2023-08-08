---
"@fluid-experimental/devtools-core": minor
---

Remove enum use to enhance (future) back/forwards compatibility

This change removes a couple of (internal) enums from the API, and refactors another to not be TypeScript enum (which has unfortunately back/forward compatibility properties).

Removals:

-   `DevtoolsFeature`
-   `ContainerDevtoolsFeature`

Updates:

-   Inlines properties in `DevtoolsFeatureFlags` and `ContainerDevtoolsFeatureFlags`
-   Converts `EditType` to a non-TS-enum
