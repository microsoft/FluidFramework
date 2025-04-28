---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Typing derived from unions of AllowedTypes arrays is fixed

Unions of array types provided as an [AllowedTypes](https://fluidframework.com/docs/api/fluid-framework/allowedtypes-typealias) used to result in incorrectly computed insertable content types.
This happened because [InsertableTreeNodeFromAllowedTypes](https://fluidframework.com/docs/api/fluid-framework/insertabletreenodefromallowedtypes-typealias) distributed over the union, violating the policy documented in [Input](https://fluidframework.com/docs/api/fluid-framework/input-typealias) for how schema-derived input types should be computed.
This has been fixed.
To get usable Input types, SharedTree schema's types should always capture the exact schema provided at runtime and not unions of possible different schema.
Any code impacted by this change should be updated to replace any such unions with more specific types.
