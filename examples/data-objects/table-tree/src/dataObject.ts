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

import { Column, Table } from "./schema.js";

/**
 * A data object for managing a shared table using `SharedTree`.
 *
 * @remarks
 * This class is responsible for initializing the tree with a predefined schema (`Table`)
 */
export class TableDataObject extends TreeDataObject<TreeView<typeof Table>> {
	public readonly config = new TreeViewConfiguration({ schema: Table });
	public static readonly factory = new PureDataObjectFactory<
		TreeDataObject<TreeView<typeof Table>>
	>(`TreeDataObject`, TableDataObject, [SharedTree.getFactory()], {});

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
	return new Table({
		columns: [
			new Column({
				props: {
					label: "Column 0",
					hint: "text",
				},
			}),
			new Column({ props: { label: "Column 1", hint: "date" } }),
			new Column({ props: { label: "Column 2", hint: "checkbox" } }),
		],
		rows: [
			{
				cells: {},
				props: {
					label: "Row 0",
				},
			},
			{
				cells: {
					"column-1": "Hello world!",
				},
				props: { label: "Row 1" },
			},
		],
	});
}
