---
"@fluidframework/tree": minor
---

Using "delete" on tree fields now errors instead of not working correctly.

TypeScript allows "delete" on object node optional fields if "exactOptionalPropertyTypes" is not enabled. This does not work correctly at runtime and now produces an informative error.
