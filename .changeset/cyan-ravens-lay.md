---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Add an alternative flow for loading and initializing tree views

`ViewableTreeAlpha.openView` (`asAlpha(tree).openView(config)`) offers an alternative flow for loading and initializing tree views, which makes schema upgrades automatic (when required).
The caller, therefore, no longer needs to be concerned about various tree view compatibility states - the result is either a usable tree view or an error explaining why the document cannot be loaded or initialized.


#### Caller experience

Both of the following examples use the same note schema and a configured Fluid client named `client`.
The container schema identifies the SharedTree; the view configuration describes the note stored in it.
Whether you create or load a note, you get a `NoteDocument` with the open container and the editable view.

```typescript
import { SchemaFactory, SharedTree, TreeViewConfiguration, type IFluidContainer } from "fluid-framework";
import { asAlpha, type TreeViewAlpha } from "@fluidframework/tree/alpha";

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

Create a detached container and open its tree.
You expect an initializer because no client has set the document's schema or content yet.
Initialize the note **before** attaching the container so other clients can only load an initialized document.

```typescript
async function createNote(title: string): Promise<NoteDocument> {
	const { container } = await client.createContainer(containerSchema, "2.0.0");
	try {
		const result = asAlpha(container.initialObjects.tree).openView(treeViewConfig);
		switch (result.kind) {
			case "uninitialized": {
				const view = result.initialize({ title });
				try {
					await container.attach();
				} catch (error) {
					view.dispose();
					throw error;
				}
				return { container, view };
			}
			case "ready":
				throw new Error("Expected a new Note, but the tree is already initialized.");
			case "incompatible":
				throw new Error("Cannot create the Note with this schema.", { cause: result.incompatibilities });
		}
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

##### Loading an existing document

Pass the saved document ID to `loadNote`.
It loads the container by ID, then opens the tree with the same view configuration.
The `"ready"` case gives you the existing note, including when opening required a schema upgrade.
Neither of the other cases should create or replace content on the load path.

```typescript
async function loadNote(documentId: string): Promise<NoteDocument> {
	const { container } = await client.getContainer(documentId, containerSchema, "2.0.0");
	try {
		const result = asAlpha(container.initialObjects.tree).openView(treeViewConfig);
		switch (result.kind) {
			case "ready":
				return { container, view: result.view };
			case "uninitialized":
				throw new Error("The tree has not been initialized.");
			case "incompatible":
				throw new Error("This version of the schema cannot open the existing Note tree.", { cause: result.incompatibilities });
		}
	} catch (error) {
		container.dispose();
		throw error;
	}
}
```

On success, the caller can read or edit `view.root.title` immediately.
The caller owns the returned view and container and disposes both when it closes the note.
