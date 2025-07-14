/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Update import once TreeDataObject is exported in our non-internal package.
// eslint-disable-next-line import/no-internal-modules
import { TreeDataObject, TreeDataObjectFactory } from "@fluidframework/aqueduct/internal";
import { SharedTree, TreeViewConfiguration, type TreeView } from "@fluidframework/tree/legacy";

import { Column, Row, Table } from "./schema.js";

/**
 * A data object for managing a shared table using `SharedTree`.
 *
 * @remarks
 * This class is responsible for initializing the tree with a predefined schema (`Table`)
 */
export class TableDataObject extends TreeDataObject {
	public readonly config = new TreeViewConfiguration({ schema: Table });
	public static readonly factory = new TreeDataObjectFactory({
		type: `TreeDataObject`,
		ctor: TableDataObject,
		sharedObjects: [SharedTree.getFactory()],
	});

	#treeView: TreeView<typeof Table> | undefined;

	/**
	 * The schema-aware view of the tree.
	 */
	public get treeView(): TreeView<typeof Table> {
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

		this.treeView.initialize(getInitialTree());
	}

	protected override async initializingFromExisting(): Promise<void> {
		this.initializeView();
		if (!this.treeView.compatibility.canView) {
			throw new Error("Incompatible schema");
		}
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
