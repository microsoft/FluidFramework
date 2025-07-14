/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeDataObject, TreeDataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { SharedString } from "@fluidframework/sequence/legacy";
import { SharedTree, TreeViewConfiguration, type TreeView } from "@fluidframework/tree/legacy";
import { v4 as uuid } from "uuid";

import { TodoItem, TodoList } from "./index.js";

/**
 * Props used when creating a new todo item.
 */
export interface TodoItemProps {
	/**
	 * The initial text to populate the todo item's title with.
	 * This value will be inserted into the shared string at index 0.
	 */
	readonly startingText: string;
}
/**
 * A data object for managing a shared todo list using `SharedTree`.
 *
 * @remarks
 * This class is responsible for initializing the tree with a predefined schema (`TodoList`)
 */
export class TodoListDataObject extends TreeDataObject {
	public readonly config = new TreeViewConfiguration({ schema: TodoList });
	public static readonly factory = new TreeDataObjectFactory({
		type: `TreeDataObject`,
		ctor: TodoListDataObject,
		sharedObjects: [SharedTree.getFactory(), SharedString.getFactory()],
	});

	#treeView: TreeView<typeof TodoList> | undefined;

	/**
	 * The schema-aware view of the tree.
	 */
	public get treeView(): TreeView<typeof TodoList> {
		if (this.#treeView === undefined) {
			throw new Error("treeView has not been initialized.");
		}
		return this.#treeView;
	}

	/**
	 * Converts the underlying ITree into a typed TreeView using the provided schema configuration.
	 *
	 * @param tree - The ITree instance to view.
	 * @returns A typed TreeView using the TodoList schema.
	 */
	private initializeView(): void {
		this.#treeView = this.tree.viewWith(this.config);
	}

	protected override async initializingFirstTime(): Promise<void> {
		this.initializeView();
		if (!this.treeView.compatibility.canInitialize) {
			throw new Error("Incompatible schema");
		}

		const title = SharedString.create(this.runtime);
		title.insertText(0, "Title");
		this.treeView.initialize(new TodoList({ title: title.handle, items: [] }));
	}

	protected override async initializingFromExisting(): Promise<void> {
		this.initializeView();
		if (!this.treeView.compatibility.canView) {
			throw new Error("Incompatible schema");
		}
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
