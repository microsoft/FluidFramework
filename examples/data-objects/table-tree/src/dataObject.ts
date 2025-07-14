/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeDataObject, TreeDataObjectFactory } from "@fluidframework/aqueduct/legacy";
import {
	SharedTree,
	TreeViewConfiguration,
	type ITree,
	type TreeView,
} from "@fluidframework/tree/legacy";

import { Column, Row, Table } from "./schema.js";

/**
 * A data object for managing a shared table using `SharedTree`.
 *
 * @remarks
 * This class is responsible for initializing the tree with a predefined schema (`Table`)
 */
export class TableDataObject extends TreeDataObject<TreeView<typeof Table>> {
	public readonly config = new TreeViewConfiguration({ schema: Table });
	public static readonly factory = new TreeDataObjectFactory<
		TreeDataObject<TreeView<typeof Table>>,
		TreeView<typeof Table>
	>({
		type: `TreeDataObject`,
		ctor: TableDataObject,
		sharedObjects: [SharedTree.getFactory()]
	});

	public override generateView(tree: ITree): TreeView<typeof Table> {
		return tree.viewWith(this.config);
	}

	/**
	 * Initializes the tree with a starter table.
	 * @remarks Called during the initial creation of the data object.
	 */
	public override async initializingFirstTime(): Promise<void> {
		this.treeView.initialize(getInitialTree());
	}
}

/**
 * Gets the initial content for a new table tree.
 */
function getInitialTree(): Table {
	const taskNameColumn = new Column({
		props: {
			label: "Task",
			hint: "text",
		},
	});
	const dateColumn = new Column({
		props: {
			label: "Date",
			hint: "date",
		},
	});
	const completedColumn = new Column({
		props: {
			label: "Completed?",
			hint: "checkbox",
		},
	});

	const row0 = new Row({
		cells: {
			[taskNameColumn.id]: "Clean laundry",
			[dateColumn.id]: new Date().toISOString(),
			[completedColumn.id]: "true",
		},
	});
	const row1 = new Row({
		cells: {
			[taskNameColumn.id]: "Walk the dog",
			[dateColumn.id]: new Date().toISOString(),
		},
	});

	return new Table({
		columns: [taskNameColumn, dateColumn, completedColumn],
		rows: [row0, row1],
	});
}
