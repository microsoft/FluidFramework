---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
section: tree
---

Record node kind was added (alpha)

Adds a new node kind to SharedTree to represent record-like data.
Like map nodes, only string keys are supported.

```typescript
class MyRecord extends schemaFactory.record("my-record", [schemaFactory.number, schemaFactory.string]) {}
const myRecord = new MyRecord({
	foo: 42,
	bar: "Hello world!"
});

const foo = myRecord.foo; // 42

myRecord.baz = 37;

const keys = Object.keys(myRecord); // ["foo", "bar", "baz"]
const values = Object.values(myRecord); // [42, "Hello world!", 37]
const entries = Object.entries(myRecord); // [["foo", 42], ["bar", "Hello world!"], ["baz", 37]]
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
