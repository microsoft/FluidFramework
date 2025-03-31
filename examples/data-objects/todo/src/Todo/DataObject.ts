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

export interface ITodoItemInitialState {
	readonly startingText: string;
}

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

	public override generateView(tree: ITree): TreeView<typeof TodoList> {
		return tree.viewWith(this.config) as unknown as TreeView<typeof TodoList>;
	}

	public override async initializingFirstTime(): Promise<void> {
		const title = SharedString.create(this.runtime);
		title.insertText(0, "Title");
		this.treeView.initialize(new TodoList({ title: title.handle, items: [] }));
	}

	public async addTodoItem(props?: ITodoItemInitialState) {
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
