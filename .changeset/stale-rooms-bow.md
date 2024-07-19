---
"fluid-framework": minor
"@fluidframework/tree": minor
---

Using "delete" on tree fields now throws an error instead of not working correctly

TypeScript allows `delete` on object node optional fields if the `exactOptionalPropertyTypes` tsconfig setting is not
enabled. This does not work correctly at runtime and now produces an informative error.
