---
"@fluidframework/sequence": minor
---

Deprecation of the type parameter in IntervalCollection's add method, deprecation of changeProperties, and updates to the signatures of IntervalColletcion add and change.

The type parameter is being removed from IntervalCollection.add. The new usage requires calling add with an object containing each of the desired parameters.
Example: add({start: 0, end: 1, props: { a: b }, stickiness: IntervalStickiness.END}).

The signature of IntervalCollection.change is also being updated to an object containing the desired parameters, instead of the existing list of parameters. In addition, changeProperties will be removed, so in order to change the properties of an interval, the change method (with the updated signature) will be used.
Examples:
Change interval endpoints: change({ id: "id", start: 3, end: 4})
Change interval properties: change({ id: "id", props: { a: c }})
