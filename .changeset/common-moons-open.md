---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix adaptEnum's handling of numeric enums

Enum entries who's values are numeric get additional properties on TypeScript's generated Enum object.
These values were getting treated like enum entries at runtime by `adaptEnum` (`@beta`).
This has been fixed and the runtime behavior now matches the types in this case.

Additionally the schema returned by adaptEnum now toString more usefully, including the value of the particular enum entry: this has no effect on the nodes, just the schema.
