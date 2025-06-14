---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add TreeAlpha.child and TreeAlpha.children APIs for generic tree traversal

#### TreeAlpha.child

Access a child node or value of a `TreeNode` by its property key.

```typescript
class MyObject extends schemaFactory.object("MyObject", {
	foo: schemaFactory.string;
	bar: schemaFactory.optional(schemaFactory.string);
}) {}

const myObject = new MyObject({
	foo: "Hello world!"
});

const foo = TreeAlpha.child(myObject, "foo"); // "Hello world!"
const bar = TreeAlpha.child(myObject, "bar"); // undefined
const baz = TreeAlpha.child(myObject, "baz"); // undefined
```

#### TreeAlpha.children

Get all child nodes / values of a `TreeNode`, keyed by their property keys.

```typescript
class MyObject extends schemaFactory.object("MyObject", {
	foo: schemaFactory.string;
	bar: schemaFactory.optional(schemaFactory.string);
	baz: schemaFactory.optional(schemaFactory.number);
}) {}

const myObject = new MyObject({
	foo: "Hello world!",
	baz: 42,
});

const children = TreeAlpha.children(myObject); // [["foo", "Hello world!"], ["baz", 42]]
```
