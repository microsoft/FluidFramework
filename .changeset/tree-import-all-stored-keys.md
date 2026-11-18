---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Import trees that use all stored keys

[`TreeAlpha.importVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#importverbose-methodsignature) now supports [`KeyEncodingOptions.allStoredKeys`](https://fluidframework.com/docs/api/fluid-framework/keyencodingoptions-enum#allstoredkeys-enummember).
Before this change, you could use `allStoredKeys` only for export.
Data that [`TreeAlpha.exportVerbose`](https://fluidframework.com/docs/api/fluid-framework/treealpha-interface#exportverbose-methodsignature) exports with `allStoredKeys` includes [unknown optional fields](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature), and the import could not read them.
Now you can export a tree and import it again without losing data.

To import with `allStoredKeys`, use the new [`TreeImportOptions`](https://fluidframework.com/docs/api/fluid-framework/treeimportoptions-typealias).
Set `keys` to `KeyEncodingOptions.allStoredKeys`.
Set `view` to a view of the document.
The import then uses the stored schema of the view's document.
All of the data must agree with this stored schema, and you can insert the result into that document.
The view must be able to view its document, and the schema that you give to the import must come from the view schema of that view.

To find the unknown optional fields in the imported tree, use [`TreeContextAlpha.unknownFieldSchemas`](https://fluidframework.com/docs/api/fluid-framework/treecontextalpha-interface#unknownfieldschemas-propertysignature) of the view.
The imported tree is unhydrated, so its own context does not supply this information.

#### Example

Version 1 of an application defines a `Person` with a `name` field, and allows unknown optional fields:

```typescript
const sf = new SchemaFactoryBeta("com.example");
class Person extends sf.object(
	"Person",
	{ name: sf.string },
	{ allowUnknownOptionalFields: true },
) {}
```

Version 2 of the application adds an optional `nickname` field to `Person`:

```typescript
class Person extends sf.object(
	"Person",
	{ name: sf.string, nickname: sf.optional(sf.string) },
	{ allowUnknownOptionalFields: true },
) {}
```

After version 2 upgrades the schema of a document, the `nickname` field is unknown to version 1.
Version 1 can export a `Person`, keep the data outside of the tree, and import it again without losing `nickname`:

```typescript
// In version 1 of the application:
// `importVerbose` needs an alpha view: use `asAlpha` to get one from a `TreeView`.
const view = asAlpha(tree.viewWith(new TreeViewConfiguration({ schema: Person })));
const person = view.root;
const data = TreeAlpha.exportVerbose(person, { keys: KeyEncodingOptions.allStoredKeys });
// { type: "com.example.Person", fields: { name: "Alice", nickname: "Al" } }

// Keep `data` outside of the tree, for example in a file.
// ...

// Later, import `data` into the same document:
const copy = TreeAlpha.importVerbose(Person, data, {
	keys: KeyEncodingOptions.allStoredKeys,
	view,
});
view.root = copy; // The copy keeps `nickname`.
```
