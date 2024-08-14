---
"@fluidframework/tree": minor
---
---
section: tree
---

Support generation of JSON Schema from Shared Tree view schema (alpha)

> [!WARNING]
> This API is [alpha quality](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels) and may change at any time.

Adds alpha-quality support for canonical [JSON Schema](https://json-schema.org/docs) representation of Shared Tree schema and adds a `getJsonSchema` function for getting that representation for a given `TreeNodeSchema`.
This JSON Schema representation can be used to describe schema requirements to external systems, and can be used with validation tools like [ajv](https://ajv.js.org/) to validate data before inserting it into a `SharedTree`.

### Example

Given a `SharedTree` schema like the following:

```typescript
class MyObject extends schemaFactory.object("MyObject", {
	foo: schemaFactory.number,
	bar: schemaFactory.optional(schemaFactory.string),
});
```

JSON Schema like the following would be produced:

```json
{
	"$defs": {
		"com.fluidframework.leaf.string": {
			"type": "string",
		},
		"com.fluidframework.leaf.number": {
			"type": "number",
		},
		"com.myapp.MyObject": {
			"type": "object",
			"properties": {
				"foo": { "$ref": "com.fluidframework.leaf.number" },
				"bar": { "$ref": "com.fluidframework.leaf.string" },
			},
			"required": ["foo"],
		},
	},
	"anyOf": [ { "$ref": "#/$defs/com.myapp.MyObject" } ],
}
```
