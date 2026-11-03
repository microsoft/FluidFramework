---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alpha API to check if a node has content in unknown optional fields

Object nodes whose schema sets [allowUnknownOptionalFields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) can contain optional fields that are not in the view schema.
The content of these fields is not available through the node's properties.

The new `TreeAlpha.hasUnknownChildren` API returns `true` if a node has content in at least one unknown optional field.
To read that content, use `TreeAlpha.exportVerbose` with `KeyEncodingOptions.allStoredKeys`.

```typescript
const sf = new SchemaFactoryBeta("com.example");
class Person extends sf.object(
	"Person",
	{ name: sf.string },
	{ allowUnknownOptionalFields: true },
) {}

// ...

// A newer version of the application added a `nickname` field.
if (TreeAlpha.hasUnknownChildren(person)) {
	const content = TreeAlpha.exportVerbose(person, { keys: KeyEncodingOptions.allStoredKeys });
	// { type: "com.example.Person", fields: { name: "Alice", nickname: "Ali" } }
}
```
