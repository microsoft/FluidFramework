---
title: SharedTree Quick Start
menuPosition: 2
codeCopyButton: true
aliases:
  - "/docs/get-started/tree-quick-start/"
  - "/start/tree-quick-start/"
  - "/docs/tree-start/"

---

`SharedTree` is a [distributed data structure](../data-structures/overview.md) that looks and feels like simple JavaScript objects with a type safe wrapper.
This guide will walk you through the basics of creating, configuring, and interacting with a `SharedTree` in your application. 

## Creating a Tree

A `SharedTree` can be created by defining a `ContainerSchema` with an initial object of type `SharedTree` and using this schema to create and load your container.
This example creates a container using an Azure specific client.

See more info on creating and loading containers [here](../build/containers.md#creating-a-container).

```
import { AzureClient } from "@fluidframework/azure-client";
import { ContainerSchema, SharedTree } from "fluid-framework";

// clientProps specifies connection details and is defined by the app author
const client = new AzureClient(clientProps);

const containerSchema: ContainerSchema = {
	initialObjects: {
		appData: SharedTree,
	},
};

const { container } = await client.createContainer(containerSchema, "2");
```

After creating a `SharedTree`, you need to create a `TreeView`.
A `TreeView` provides the interface for reading and editing data on the `SharedTree`.
This is done by calling `viewWith` on the `SharedTree` with your tree configuration.

```
const treeConfiguration = new TreeViewConfiguration(
	{ schema: RootSchema }
)

const appData = container.initialObjects.appData.viewWith(
	treeConfiguration
);
```

The tree configuration takes in a schema for the root of the tree which will need to be defined by your application.

## Defining a Schema

A schema outlines the structure and types of data that your tree will manage.
Having a schema provides useful guarantees about the shape your data will take.
It is also used to generate TypeScript types which means the structure of your data is analogous to JS data types for easy use in external libraries or systems.

To define a schema, first create a `SchemaFactory` with a unique string to use as the namespace.

```
const schemaFactory = new SchemaFactory("some-schema-id-prob-a-uuid")
```

`SchemaFactory` provides some methods for specifying internal nodes including `object()`, `array()`, and `map()`; and five primitive data types for specifying leaf nodes: `boolean`, `string`, `number`, `null`, and `handle`.
See [schema definition](../data-structures/tree#schema-definition) for more info on the provided types.

You can define a schema in customizable mode by extending the notional type object which also creates a TypeScript data type.
As an example, let's write a schema for a todo list:

```
class TodoList extends schemaFactory.object("TodoList", {
	title: schemaFactory.string,
	items: todoItems,
});

class TodoItems extends schemaFactory.array("TodoItems", TodoItem);

class TodoItem extends schemaFactory.object("TodoItem", {
	description: schemaFactory.string,
	isCompleted: schemaFactory.boolean,
});
```

This creates a `TodoList` class that is an object schema with two fields, `title` and `items`. `title` is a leaf node of type `string` while `items` stores `TodoItems` which is an array of `TodoItem`.
`TodoItem` is an object with two primitive values, `description` and `isCompleted`.

Schemas can also be defined using plain old JavaScript object (POJO) mode.
Generally, you should prefer customizable mode.
See [the API docs](../api/v2/tree/schemafactory-class#schemafactory-remarks) for more info on the differences between the two modes.

## Initializing the Tree

Once your view is created, you need to initialize it with some data.
This can only be done once after the tree is created and the data you initialize your tree with must conform to the schema that you provided.

This is how we would initialize our todo list:

```
appData.initialize(new TodoList({
	title: "todo list",
	items: [
		new TodoItem({
			description: "first item",
			isComplete: true,
		}),
	]
}));
```

## Reading Data From Your Tree

Data can be read from the tree using the `root` property of the `TreeView` that you obtained through the `viewWith` method.
Since the root of our tree is an object schema, its data can be accessed like a regular JavaScript object.

If `TodoList` is the root schema of your tree, you can access the todo list data like this:

```
const todoListTitle = appData.root.title;
const firstItem = appData.root.items[0];
```

You can also iterate through the actual items, here's an example of how to use the data you're reading in a JSX component:

```
<li>
	{appData.root.items.map((item) =>
		<ul>{item.description}</ul>
	)}
</li>
```

When using the data in your tree, it's important to listen to the change events provided by the tree so that you can make any necessary updates to your application.
This is how you can use React hooks to listen to the `nodeChanged` event:

```
const [itemCount, setCount] = useState(appData.root.items.length);

useEffect(() => {
	const unsubscribe = Tree.on(appData.root.items, "nodeChanged", () => {
		setCount(appData.root.items.length);
	});
	return unsubscribe;
}, []);
```

`nodeChanged` fires whenever one or more properties of the specified node change while `treeChanged` also fires whenever any node in its subtree changes.
See [the API](../api/v2/tree/treechangeevents-interface) docs for more details.

## Editing Tree Data

There are built-in editing methods for each of the provided schema types.
For example, if your data is in an array, you can add an item like this:

```
appData.root.items.insertAt(3);
```

The schema types can also be edited using the assignment operator like this:

```
appData.root.title = "chores";
```

Editing methods can also be defined on schema classes defined in customizable mode.
This allows you to write methods that are more suited to your app's specific needs.

```
class TodoList extends schemaFactory.object("TodoList", {
	title: schemaFactory.string,
	items: todoItems,
}) {
	public removeFirst = () => {
		if (this.length > 0) this.removeAt(0);
	};
}
```
\
See [schema definition](../data-structures/tree#schema-definition) for more details on the built-in editing methods.
You can also read more about how these editing operations work in collaborative settings [here](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/docs/main/merge-semantics.md).

### Grouping Edits into Transactions

Edits can be grouped into transaction using the `Tree.runTransaction()`	API.
Using a transaction guarantees that (if applied) all of the changes will be applied together synchronously.

```
Tree.runTransaction(myNode, (node) => {
    // Make multiple changes to the tree.
    // This can be changes to the referenced node but is not limited to that scope.

    if (
        // Something is wrong here!
    ) return "rollback";
})
```

See more information on transactions [here](../data-structures/tree#transactions).

### Undoing and Redoing Edits

Calling `revert` on a `Revertible` will revert its associated commit on the associated view.

A revertible can be obtained by listening to the `commitApplied` event and calling the `getRevertible` callback provided.
The `kind` property on `CommitMetadata` tells you if a commit is the result of a normal edit, an undo, or a redo.
This aids in managing separate undo and redo stacks.
Here is a simple example of how to do so using the provided APIs:

```
const undoStack = [];
const redoStack = []

useEffect(() => {
	const unsubscribe = appData.events.on("commitApplied", (commit: CommitMetadata, getRevertible?: RevertibleFactory) => {
		if (getRevertible === undefined) {
			return;
		}
		const revertible = getRevertible();
		if (commit.kind === CommitKind.Undo) {
			redoStack.push(revertible);
		} else {
			if (commit.kind === CommitKind.Default) {
				// clear redo stack
				for (const redo of redoStack) {
					redo.dispose();
				}
				redoStack.length = 0;
			}
			undoStack.push(revertible);
		}
	});
	return unsubscribe;
}, []);
```

Note that any `Revertible`s obtained should be disposed of by the app author in order to free up the resources that are required to revert an edit.

See [undo redo support](../data-structures/tree#undoredo-support) for more information.
