---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree schema errors now explain the mismatch

Schema validation errors now report relevant context instead of internal error identifiers. Depending on the mismatch, errors identify the node type, field kind, child count, expected leaf value type, actual value type, or unexpected fields, making invalid content easier to diagnose.

When a view schema cannot access a document's stored schema, the error now reports the first schema mismatch and explains whether to initialize the document, upgrade its stored schema, use a compatible view schema, or explicitly migrate the document.
