---
"@fluidframework/tree": minor
"fluid-framework": minor
---

Makes object node fields with statically known default values (i.e., `optional` and `identifier` fields) optional when creating trees, where they were previously required.

Example:

```typescript
class Foo extends schemaFactory.object("Foo", {
	name: schemaFactory.string,
	id: schemaFactory.identifier,
	nickname: schemaFactory.optional(schemaFactory.string),
}) {}

// Before
const foo = new Foo({
	name: "Bar",
	id: undefined, // Had to explicitly specify `undefined` to opt into default behavior
	nickname: undefined, // Had to explicitly specify `undefined` for optional field
});

// After
const foo = new Foo({
	name: "Bar",
	// Can omit `id` and `nickname` fields, as both have statically known defaults!
});
```
