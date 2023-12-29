---
"@fluidframework/sequence": minor
"@fluid-private/test-end-to-end-tests": minor
---

Unify the change and changeProperties methods

Instead of having two separate APIs to modify an interval's endpoints and properties, combine both into the same method, IntervalCollection.change. Change is called with a string id value as the first parameter, and an object containing the start value, the end value, and/or the properties, depending on the desired modifications to the interval. Start and end must both be either defined or undefined. 

The old functionality and signatures were deprecated in the internal.7.4.0 minor release. 
