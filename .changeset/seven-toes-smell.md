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

```typescript
class MyArray extends schemaFactory.array("MyArray", schemaFactory.string) {}

const myArray = new MyArray("Hello", "World");

const child0 = TreeAlpha.child(myArray, 0); // "Hello"
const child1 = TreeAlpha.child(myArray, 1); // "World
const child2 = TreeAlpha.child(myArray, 2); // undefined
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

```typescript
class MyArray extends schemaFactory.array("MyArray", schemaFactory.string) {}

const myArray = new MyArray("Hello", "World");

const children = TreeAlpha.children(myObject); // [[0, "Hello"], [1, "World"]]
```
