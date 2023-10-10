---
"@fluidframework/sequence": minor
---

Deprecation of the `intervalType` parameter in IntervalCollection's add method and wrapping its parameters into an object.

The `intervalType` parameter is being removed from IntervalCollection.add. The new usage requires calling add with an object containing each of the desired parameters.
Example: add({start: 0, end: 1, props: { a: b }}).

The signature of IntervalCollection.change is also being updated to an object containing the desired parameters, instead of the existing list of parameters. In addition, changeProperties will be removed, so in order to change the properties of an interval, the change method (with the updated signature) will be used. The id of the interval is not included in the object passed to change, but is instead passed as the first parameter to change.
Examples:
Change interval endpoints: change(intervalId, { start: 3, end: 4 })
Change interval properties: change(intervalId, { props: { a: c } })
