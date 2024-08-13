---
"fluid-framework": minor
"@fluidframework/merge-tree": minor
"@fluidframework/sequence": minor
"@fluid-experimental/sequence-deprecated": minor
---
---
"section": "deprecation"
---
Deprecate the PropertyManager Class and Its Exposure

The `PropertyManager` class, along with the `propertyManager` properties and `addProperties` functions on segments and intervals, are not intended for external use.
These elements will be removed in a future release for the following reasons:
 * There are no scenarios where their direct use is needed.
 * Using them directly will result in eventual consistency problems.
 * Upcoming features will require modifications to these mechanisms.
