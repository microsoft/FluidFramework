---
"@fluidframework/sequence": minor
---

Removal of the type parameter in IntervalCollection's add method.

The type parameter is being removed from IntervalCollection.add. The new usage just requires calling add without the type parameter: add(start, end, props, stickiness).
