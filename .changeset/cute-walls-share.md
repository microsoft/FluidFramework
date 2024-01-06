---
"@fluidframework/sequence": minor
---

sequence: Remove the signature of IntervalCollection.add that takes a type parameter

The previously deprecated signature of `IntervalCollection.add` that takes an `IntervalType` as a parameter is now being
removed. The new signature is called without the type parameter and takes the `start`, `end`, and `properties`
parameters as a single object.
