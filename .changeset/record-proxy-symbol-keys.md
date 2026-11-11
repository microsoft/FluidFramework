---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Customizable record nodes work when JavaScript private fields are transpiled to symbol-keyed properties

Fluid Framework targets ES2022, which supports JavaScript private fields (`#field`) natively.
Some tools transpile them to symbol-keyed properties for older runtimes, for example Babel with its `privateFieldsAsSymbols` assumption.
Fluid doesn't directly support those runtimes, but such tools are used to bundle applications.
With them, every tree node gets a non-configurable symbol-keyed property in place of a private field that the node's base class declares.

Previously, `Object.keys`, `Reflect.ownKeys`, object spread and similar operations threw a `TypeError` on a customizable record node (one declared as a class extending `SchemaFactory.record`) that had such a property.
A customizable record node now reports its symbol-keyed own properties to these operations.
Reading or writing a symbol-keyed property through the node is unchanged.

`Object.keys` still reports only the record's entries, since symbol-keyed properties are not string keys.
Object spread copies a node's enumerable symbol-keyed own properties as well as its entries, but transpiled private fields are not enumerable, so spread still copies only the record's entries in that case.
