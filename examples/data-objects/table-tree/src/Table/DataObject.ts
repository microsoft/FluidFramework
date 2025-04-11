/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Update import once TreeDataObject is exported in our non-internal package.
// eslint-disable-next-line import/no-internal-modules
import { TreeDataObject } from "@fluidframework/aqueduct/internal";
import { PureDataObjectFactory } from "@fluidframework/aqueduct/legacy";
import {
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/legacy";

import { Table } from "./tableSchema.js";

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
export class TableDataObject extends TreeDataObject<TreeView<typeof Table>> {
	public readonly config = new TreeViewConfiguration({ schema: Table });
	public static readonly factory = new PureDataObjectFactory<
		TreeDataObject<TreeView<typeof Table>>
	>(`TreeDataObject`, TableDataObject, [SharedTree.getFactory()], {});

	/**
	 * Converts the underlying ITree into a typed TreeView using the provided schema configuration.
	 *
	 * @param tree - The ITree instance to view.
	 * @returns A typed TreeView using the TodoList schema.
	 */
	public override generateView(tree: ITree): TreeView<typeof Table> {
		return tree.viewWith(this.config) as unknown as TreeView<typeof Table>;
	}

	/**
	 * Initializes the tree with a default title and empty todo item list.
	 * @remarks Called during the initial creation of the data object.
	 */
	public override async initializingFirstTime(): Promise<void> {
		this.treeView.initialize(
			new Table({
				columns: [
					{
						id: "column-0",
					},
					{
						id: "column-1",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
					{
						id: "row-1",
						cells: {
							"column-1": {
								value: "Hello world!",
							},
						},
					},
				],
			}),
		);
	}
}
