---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
SharedTree schema validation errors now explain the mismatch

Schema validation errors now report relevant context instead of internal error identifiers. Depending on the mismatch, errors identify the node type, field kind, child count, expected leaf value type, actual value type, or unexpected fields, making invalid content easier to diagnose.
