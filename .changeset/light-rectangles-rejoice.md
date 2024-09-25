---
"@fluidframework/tree": minor
---
---
section: tree
---

Allow associating metadata with Field Schema

Users of TreeView can now specify metadata when creating Field Schema.
This includes system-understood metadata, i.e., `description`.

Example:

```typescript

class Point extends schemaFactory.object("Point", {
	x: schemaFactory.required(schemaFactory.number, {
		metadata: { description: "The horizontal component of the point." }
	}),
	y: schemaFactory.required(schemaFactory.number, {
		metadata: { description: "The vertical component of the point." }
	}),
}) {}

```

Functionality like the experimental conversion of Tree Schema to [JSON Schema](https://json-schema.org/). (`getJsonSchema`) can leverage such system-understood metadata to generate useful information.
In the case of the `description` property, this is mapped directly to the `description` property supported by JSON Schema.

Custom, user-defined properties can also be specified.
These properties will not be leveraged by the system by default, but can be used as a handy means of associating common application-specific properties with Field Schema.

Example:

An application is implementing search functionality.
By default, the app author wishes for all app content to be potentially indexable by search, unless otherwise specified.
They can leverage schema metadata to decorate fields that should be ignored by search, and leverage that information when walking the tree during a search.

```typescript

interface AppMetadata {
	/**
	 * Whether or not the field should be ignored by search.
	 * @defaultValue `false`
	 */
	searchIgnore?: boolean;
}

class Note extends schemaFactory.object("Note", {
	position: schemaFactory.required(Point, {
		metadata: {
			description: "The position of the upper-left corner of the note."
			custom: {
				// Search doesn't care where the note is on the canvas.
				// It only cares about the text content.
				searchIgnore: true
			}
		}
	}),
	text: schemaFactory.required(schemaFactory.string, {
		metadata: {
			description: "The textual contents of the note."
		}
	}),
}) {}

```

Search can then be implemented to look for the appropriate metadata, and leverage it to omit the unwanted position data from search.
