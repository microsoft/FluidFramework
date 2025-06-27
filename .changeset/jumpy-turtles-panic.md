---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
section: tree
---

TODO: note NodeKind compat

Record node kind was added (alpha)

Adds a new node kind to SharedTree to represent record-like data.
As is the case with map nodes, record nodes only support string keys.

```typescript
class MyRecord extends schemaFactory.record("my-record", [schemaFactory.number, schemaFactory.string]) {}
const myRecord = new MyRecord({
	foo: 42,
	bar: "Hello world!"
});

const foo = myRecord.foo; // 42

delete myRecord.foo;

myRecord.baz = 37;

const keys = Object.keys(myRecord); // ["bar", "baz"]
const values = Object.values(myRecord); // ["Hello world!", 37]
const entries = Object.entries(myRecord); // [["bar", "Hello world!"], ["baz", 37]]
```

#### Additional features

In addition to standard operations afforded by standard TypeScript records, SharedTree record nodes can also be iterated.

```typescript
class MyRecord extends schemaFactory.record("my-record", [schemaFactory.number, schemaFactory.string]) {}
const myRecord = new MyRecord({
	foo: 42,
	bar: "Hello world!"
});

for (const [key, value] of myRecord) {
	...
}

const a = { ...myRecord }; // { foo: 42, bar: "Hello world!" }
const b = [...myRecord]; // [["foo", 42], ["bar, "Hello world!"]]
```

#### Recursive records

Recursive record schema can be defined using `recordRecursive` on [SchemaFactoryAlpha](https://fluidframework.com/docs/api/fluid-framework/schemafactoryalpha-class).

```typescript
class MyRecord extends schemaFactory.recordRecursive("my-record", [schemaFactory.string, () => MyRecord]) {}
const myRecord = new MyRecord({
	foo: "Hello world!",
	bar: new MyRecord({
		x: "foo",
		y: new MyRecord({})
	})
});
```

#### TableSchema update (alpha)

The [TableSchema](https://fluidframework.com/docs/api/fluid-framework/tableschema-namespace/) APIs have been updated to use record nodes in the schema they generate.
Specifically, the `Row` representation now uses a record to store its column-cell pairs, rather than a map.

The node types derived from these APIs

The persisted format of documents containing trees derived from these APIs is the same, so this change is forward and backward compatible.

#### JsonDomainSchema update (alpha)

[JsonObject](https://fluidframework.com/docs/api/fluid-framework/jsonastree-namespace/jsonobject-class) has been updated to a record rather than a map.

The persisted format of documents containing trees derived from these APIs is the same, so this change is forward and backward compatible.
