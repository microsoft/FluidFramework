---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Preserve array and map node types when accessing alpha APIs

Calling `asAlpha` on an array or map node now preserves its read and insertion types, customized subclass members, and schema identity.
The additional alpha methods use the node's existing read and insertion types, so valid content remains accepted and invalid content remains rejected.

Let the type arguments be inferred to preserve the complete node type.
Existing calls with an explicit allowed-types argument remain supported; specify the node type as the second type argument to also preserve customized members in these calls.
The conversion still returns the original node without changing runtime behavior.
