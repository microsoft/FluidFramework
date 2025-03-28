/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { TreeDataObject } from "@fluidframework/aqueduct/internal";
import { PureDataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { SharedString } from "@fluidframework/sequence/legacy";
import { SharedTree, type ITree, type TreeView } from "@fluidframework/tree/legacy";
import React from "react";
import { v4 as uuid } from "uuid";

import type { ITodoItemInitialState } from "../TodoItem/index.js";

import { TodoTreeItem, treeConfiguration, TodoTree, TodoTreeView } from "./index.js";

export const todoTreeName = "TodoTree";

export const getDirectLink = (itemId: string) => {
	const pathParts = window.location.pathname.split("/");
	const containerName = pathParts[2];

	// NOTE: Normally the logic getting from the url to the container should belong to the app (not the container code).
	// This way the app retains control over its url format (e.g. here, the /doc/containerName path is actually
	// determined by webpack-fluid-loader).  It's entirely possible that an app may even choose not to permit direct
	// linking.
	const urlToContainer = `/doc/${containerName}`;

	// It is, however, appropriate for the container code to define the in-container routing (e.g. /itemId).
	return `${urlToContainer}/${itemId}`;
};

export class TodoTreeDataObject extends TreeDataObject<TreeView<typeof TodoTree>> {
	public readonly config = treeConfiguration;
	public static readonly factory = new PureDataObjectFactory<
		TreeDataObject<TreeView<typeof TodoTree>>
	>(
		`TreeDataObject`,
		TodoTreeDataObject,
		[SharedTree.getFactory(), SharedString.getFactory()],
		{},
	);

	public override generateView(tree: ITree): TreeView<typeof TodoTree> {
		return tree.viewWith(this.config) as unknown as TreeView<typeof TodoTree>;
	}

	public override async initializingFirstTime(): Promise<void> {
		const text = SharedString.create(this.runtime);
		text.insertText(0, "Title");
		this.treeView.initialize(new TodoTree({ title: text.handle, items: [] }));
	}

	public async addTodoItem(props?: ITodoItemInitialState) {
		const text = SharedString.create(this.runtime);
		const newItemText = props?.startingText ?? "New Item";
		text.insertText(0, newItemText);
		const detailedText = SharedString.create(this.runtime);

		const todoItem = new TodoTreeItem({
			text: text.handle,
			detailedText: detailedText.handle,
			checked: false,
		});

		// Generate an ID that we can sort on later, and store the handle.
		const id = `${Date.now()}-${uuid()}`;

		this.treeView.root.items.set(id, todoItem);

		console.log("inside addTodoItem");
		console.log(this.treeView);
	}

	public TreeViewComponent(props: { root: TodoTreeDataObject }): React.ReactElement {
		return <TodoTreeView todoModel={props.root} getDirectLink={getDirectLink} />;
	}
}
