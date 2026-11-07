---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Customizable record nodes report their own symbol properties

A customizable record node (one declared as a class extending `SchemaFactory.record`) now reports its own symbol properties, such as private fields compiled to symbol properties.
Previously, `Object.keys`, `Reflect.ownKeys`, object spread and similar operations threw a `TypeError` on such a node when one of those properties was non-configurable.
This occurs, for example, when a subclass of a customizable record with a private field is compiled with Babel's `privateFieldsAsSymbols` assumption.

`Object.keys` and object spread still report only the record's entries, since symbol properties are not enumerable string keys.
