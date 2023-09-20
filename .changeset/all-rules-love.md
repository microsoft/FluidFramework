---
"@fluidframework/sequence": minor
---

Deprecation of the type parameter in IntervalCollection's add method.

The type parameter is being removed from IntervalCollection.add. The new usage requires calling add with an object containing each of the desired parameters.
Example: add({start: 0, end: 1, props: { a: b }, stickiness: IntervalStickiness.END}).
