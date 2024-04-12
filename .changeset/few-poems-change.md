---
"@fluidframework/tree": minor
---

Empty optional fields on object nodes now are undefined non-enumerable own properties instead of not a property at all.

Empty optional fields on object nodes now are now undefined non-enumerable own properties.
This improves behavior in cases where they shadow inherited members which no longer have types which differ from the runtime behavior.
