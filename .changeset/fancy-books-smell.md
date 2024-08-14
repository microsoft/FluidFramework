---
"fluid-framework": minor
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
"@fluid-experimental/sequence-deprecated": minor
---
---
"section": "deprecation"
---
The PropertyManager class and related functions and properties are deprecated

The `PropertyManager` class, along with the `propertyManager` properties and `addProperties` functions on segments and intervals, are not intended for external use.
These elements will be removed in a future release for the following reasons:

 * There are no scenarios where they need to be used directly.
 * Using them directly will cause eventual consistency problems.
 * Upcoming features will require modifications to these mechanisms.
