---
"@fluidframework/sequence": minor
---

Deprecation of the type parameter in IntervalCollection's add method.

The type parameter is being removed from IntervalCollection.add. The new usage requires calling add with only start, end, and optional properties.
Example: add( 0, 1, { a: b }).
