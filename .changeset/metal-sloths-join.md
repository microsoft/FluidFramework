---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Disallow some invalid and unsafe ObjectNode field assignments at compile time

The compile time validation of the type of values assigned to ObjectNode fields is limited by TypeScript's limitations.
Two cases which were actually possible to disallow and should be disallowed for consistency with runtime behavior and similar APIs were being allowed:

1. [Identifier fields](https://fluidframework.com/docs/api/v2/fluid-framework/schemafactory-class#identifier-property):
   Identifier fields are immutable, and setting them produces a runtime error.
   This changes fixes them to no longer be typed as assignable.

2. Fields with non-exact schema:
   When non-exact scheme is used for a field (for example the schema is either a schema only allowing numbers or a schema only allowing strings) the field is no longer typed as assignable.
   This matches how constructors and implicit node construction work.
   For example when a node `Foo` has such an non-exact schema for field `bar`, you can no longer unsafely do `foo.bar = 5` just like how you could already not do `new Foo({bar: 5})`.

This fix only applies to [`SchemaFactory.object`](https://fluidframework.com/docs/api/v2/fluid-framework/schemafactory-class#object-method).
[`SchemaFactory.objectRecursive`](https://fluidframework.com/docs/api/v2/fluid-framework/schemafactory-class#objectrecursive-method) was unable to be updated to match due to TypeScript limitations on recursive types.

An `@alpha` API, `customizeSchemaTyping` has been added to allow control over the types generated from schema.
For example code relying on the unsound typing fixed above can restore the behavior using `customizeSchemaTyping`:
