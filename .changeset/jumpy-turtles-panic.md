---
"@fluidframework/tree": minor
"fluid-framework": minor
---
---
section: tree
---
Record node kind was added (alpha)

Adds a new kind of node to SharedTree that models a TypeScript record.
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

#### `NodeKind` enum update

This change includes the addition of a new flag to the [NodeKind](https://fluidframework.com/docs/api/fluid-framework/nodekind-enum) enum.
This API notes in its documentation that users should not treat its flags as an exhaustive set.

If you have code that treats it that way, this change may break you.
We recommend updating your code to be more tolerant of unknown node kinds going forward.

Also see alternative options for schema-agnostic tree traversal if needed:
- [Tree.parent](https://fluidframework.com/docs/api/fluid-framework/treenodeapi-interface#parent-methodsignature)
- [TreeAlpha.child](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#child-methodsignature)
- [TreeAlpha.children](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#children-methodsignature)

#### Additional features

In addition to the operations afforded by TypeScript records, SharedTree record nodes can be iterated (equivalent to Object.entries).

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

The node types derived from these APIs model their data in a row-major format.
That is, each row in the table contains the set of cells that belong to that row, where each cell is indexed by its corresponding column.

Previously, this was modeled using a [MapNode](https://fluidframework.com/docs/api/fluid-framework/treemapnode-interface).
This format proved cumbersome to interop with popular table rendering libraries like [tanstack](https://tanstack.com/table), which expect a record-like format.

The persisted format of documents containing trees derived from these APIs is the same, so this change is forward and backward compatible.

#### JsonDomainSchema update (alpha)

[JsonObject](https://fluidframework.com/docs/api/fluid-framework/jsonastree-namespace/jsonobject-class) has been updated to a record rather than a map.

The persisted format of documents containing trees derived from these APIs is the same, so this change is forward and backward compatible.
