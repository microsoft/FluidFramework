---
"@fluidframework/tree": minor
"__section": feature
---
Added `Tree.ensureSchema`

This helper function allows content to be tagged with a schema type before being inserted into the tree.
This allows content that would otherwise be ambiguous to be well-defined, without having to wrap it in a node constructor.

Example:

```typescript
const sf = new SchemaFactory("example");
class Dog extends sf.object("Dog", { name: sf.string() }) {}
class Cat extends sf.object("Cat", { name: sf.string() }) {}
class Root extends sf.object("Root", { pet: [Dog, Cat] }) {}
// ...
const pet = { name: "Max" };
view.root.pet = pet; // Error: `pet` is ambiguous - is it a Dog or a Cat?
view.root.pet = new Dog(pet); // This works, but has the overhead of creating a Dog node before the insertion actually happens.
TreeAlpha.ensureSchema(Dog, pet); // Instead, this tags the `pet` object as a Dog...
view.root.pet = pet; // So now there is no error for a normal insertion - it's a Dog.
```

This function works by leveraging the new `schemaSymbol`, which is also available for use.
See its documentation for more information.
