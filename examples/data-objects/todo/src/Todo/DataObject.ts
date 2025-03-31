/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Update import once TreeDataObject is exported in our non-internal package.
// eslint-disable-next-line import/no-internal-modules
import { TreeDataObject } from "@fluidframework/aqueduct/internal";
import { PureDataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { SharedString } from "@fluidframework/sequence/legacy";
import {
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/legacy";
import { v4 as uuid } from "uuid";

import { TodoItem, TodoList } from "./index.js";

export interface TodoItemProps {
	readonly startingText: string;
}
/**
 * A data object for managing a shared todo list using `SharedTree`.
 *
 * @remarks
 * This class is responsible for initializing the tree with a predefined schema (`TodoList`)
 */
export class TodoListDataObject extends TreeDataObject<TreeView<typeof TodoList>> {
	public readonly config = new TreeViewConfiguration({ schema: TodoList });
	public static readonly factory = new PureDataObjectFactory<
		TreeDataObject<TreeView<typeof TodoList>>
	>(
		`TreeDataObject`,
		TodoListDataObject,
		[SharedTree.getFactory(), SharedString.getFactory()],
		{},
	);

	/**
	 * Converts the underlying ITree into a typed TreeView using the provided schema configuration.
	 *
	 * @param tree - The ITree instance to view.
	 * @returns A typed TreeView using the TodoList schema.
	 */
	public override generateView(tree: ITree): TreeView<typeof TodoList> {
		return tree.viewWith(this.config) as unknown as TreeView<typeof TodoList>;
	}

	/**
	 * Initializes the tree with a default title and empty todo item list.
	 * @remarks Called during the initial creation of the data object.
	 */
	public override async initializingFirstTime(): Promise<void> {
		const title = SharedString.create(this.runtime);
		title.insertText(0, "Title");
		this.treeView.initialize(new TodoList({ title: title.handle, items: [] }));
	}

	/**
	 * Adds a new todo item to the list.
	 *
	 * @param props
	 * -`startingText`: The text to prefill into the item's title.
	 *
	 * @privateRemarks
	 * This method was placed in the data object (instead of the TodoList schema class),
	 * as we needed access to the runtime to create the `SharedString`.
	 */
	public async addTodoItem(props?: TodoItemProps) {
		const title = SharedString.create(this.runtime);
		const newItemText = props?.startingText ?? "New Item";
		title.insertText(0, newItemText);
		const description = SharedString.create(this.runtime);

		const todoItem = new TodoItem({
			title: title.handle,
			description: description.handle,
			completed: false,
		});

		// TODO: We should consider creating a separate field for date, so that we do not need to
		// concatenate it to the id.
		// Generate an ID that we can sort on later, and store the handle.
		const id = `${Date.now()}-${uuid()}`;

		this.treeView.root.items.set(id, todoItem);
	}
}
