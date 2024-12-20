---
"@fluidframework/tree": minor
---
---
section: tree
---

Metadata can be associated with Node Schema

Users of TreeView can now specify metadata when creating Node Schema, via `SchemaFactoryAlpha`.
This metadata may include system-understood properties like `description`.

Example:

```typescript
const schemaFactory = new SchemaFactoryAlpha(...);
class Point extends schemaFactory.object("Point", {
	x: schemaFactory.required(schemaFactory.number),
	y: schemaFactory.required(schemaFactory.number),
},
{
	metadata: {
		description: "A point in 2D space",
	},
}) {}

```

Functionality like the experimental conversion of Tree Schema to [JSON Schema](https://json-schema.org/) ([getJsonSchema](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.4.0#user-content-metadata-can-now-be-associated-with-field-schema-22564)) leverages such system-understood metadata to generate useful information.
In the case of the `description` property, it is mapped directly to the `description` property supported by JSON Schema.

Custom, user-defined properties can also be specified.
These properties will not be used by the system by default, but can be used to associate common application-specific properties with Node Schema.

#### Example

An application is implementing search functionality.
By default, the app author wishes for all app content to be potentially indexable by search, unless otherwise specified.
They can leverage schema metadata to decorate types of nodes that should be ignored by search, and leverage that information when walking the tree during a search.

```typescript

interface AppMetadata {
	/**
	 * Whether or not nodes of this type should be ignored by search.
	 * @defaultValue `false`
	 */
	searchIgnore?: boolean;
}

const schemaFactory = new SchemaFactoryAlpha(...);
class Point extends schemaFactory.object("Point", {
	x: schemaFactory.required(schemaFactory.number),
	y: schemaFactory.required(schemaFactory.number),
},
{
	metadata: {
		description: "A point in 2D space",
		custom: {
			searchIgnore: true,
		},
	}
}) {}

```

Search can then be implemented to look for the appropriate metadata, and leverage it to omit the unwanted position data from search.

#### Potential for breaking existing code

These changes add the new property "metadata" to the base type from which all node schema derive.
If you have existing node schema subclasses that include a property of this name, there is a chance for potential conflict here that could be breaking.
If you encounter issues here, consider renaming your property or leveraging the new metadata support.
