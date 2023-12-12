---
"@fluidframework/sequence": minor
---

sequence: `change` and `changeProperties` are now a single method

Instead of having two separate methods to change the endpoints of an interval and the properties, they have been combined into a
single method that will change the endpoints, properties, or both, depending on the arguments passed in. The signature
of this combined method is now updated as well.

The new way to use the change method is to call it with an interval id as the first parameter and an object containing
the desired portions of the interval to update as the second parameter. For the object parameter, the `endpoints` field
should be an object containing the new `start` and `end` values for the interval, and the `properties` field should be
an object containing the new properties for the interval. Either the `endpoints` field or the `properties` field can be
omitted, and if neither are present, `change` will return `undefined`.

The new usage of the change method is as follows:

Change interval endpoints: `change(id, { endpoints: { start: 1, end: 4 } });`

Change interval properties: `change(id { props: { a: 1 } });`

Change interval endpoints and properties: `change(id, { endpoints: { start: 1, end: 4 }, props: { a: 1 } });`
