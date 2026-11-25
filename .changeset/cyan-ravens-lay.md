---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alternative flow for loading and initializing tree views

Use `TreeViewAlpha.initializeNew(tree, config, initialContent)` when creating a tree, and `TreeViewAlpha.openExisting(tree, config)` when loading an initialized document.
The first returns the editable view directly.
The second applies a permitted upgrade only when needed and returns either a view or structured diagnostics explaining why viewing the tree isn't possible.

Use `tree.viewWith(config)` if you need to inspect compatibility and decide whether to upgrade yourself.


#### Caller experience

Both of the following examples use the same note schema and a configured Fluid client named `client`.
The container schema identifies the SharedTree; the view configuration describes the note stored in it.
Whether you create or load a note, you get a `NoteDocument` with the open container and the editable view.

```typescript
import { SchemaFactory, SharedTree, TreeViewConfiguration, type IFluidContainer } from "fluid-framework";
import { TreeViewAlpha } from "@fluidframework/tree/alpha";

const schemaFactory = new SchemaFactory("notes");
class Note extends schemaFactory.object("Note", { title: schemaFactory.string }) {}
const treeViewConfig = new TreeViewConfiguration({ schema: Note });
const containerSchema = { initialObjects: { tree: SharedTree } } as const;

interface NoteDocument {
	readonly container: IFluidContainer<typeof containerSchema>;
	readonly view: TreeViewAlpha<typeof Note>;
}
```

##### Creating a new document

Use `TreeViewAlpha.initializeNew` **before** attaching the container so other clients can only load an initialized document.
An already-initialized tree or initial content that does not match the schema causes a usage error.

```typescript
async function createNote(title: string): Promise<NoteDocument> {
	const { container } = await client.createContainer(containerSchema, "2.0.0");
	try {
		const view = TreeViewAlpha.initializeNew(container.initialObjects.tree, treeViewConfig, { title });
		try {
			await container.attach();
		} catch (error) {
			view.dispose();
			throw error;
		}
		return { container, view };
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

##### Loading an existing document

Pass the saved document ID to `loadNote`.
It loads the container by ID, then opens the tree with the same view configuration.
`canView` tells you whether the existing note is ready to use, including after a required schema upgrade.
An incompatible schema returns diagnostics; an unexpectedly uninitialized tree throws a usage error.

```typescript
async function loadNote(documentId: string): Promise<NoteDocument> {
	const { container } = await client.getContainer(documentId, containerSchema, "2.0.0");
	try {
		const result = TreeViewAlpha.openExisting(container.initialObjects.tree, treeViewConfig);
		if (!result.canView) {
			throw new Error("This version of the app cannot open the note.", { cause: result.incompatibilities });
		}
		return { container, view: result.view };
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

On success, the caller can read or edit `view.root.title` immediately.
The caller owns the returned view and container and disposes both when it closes the note.
