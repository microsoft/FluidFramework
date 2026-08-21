---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree schema errors now explain the mismatch

Schema validation errors now report the mismatch category and attach relevant diagnostic context. Depending on the mismatch, tagged telemetry properties identify the node type, field kind, child count, expected leaf value type, actual value type, unexpected fields, or path, making invalid content easier to diagnose while allowing consumers to filter potentially sensitive user data.

When a view schema cannot access a document's stored schema, the error now reports the first schema mismatch and explains whether to initialize the document, upgrade its stored schema, use a compatible view schema, or explicitly migrate the document.
