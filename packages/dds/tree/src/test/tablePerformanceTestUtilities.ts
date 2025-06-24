/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/legacy";
import { SchemaFactoryAlpha, TreeViewConfiguration } from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import { DefaultTestSharedTreeKind } from "./utils.js";
import { AttachState } from "@fluidframework/container-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { CommitKind, type Revertible } from "../core/index.js";
import { Tree } from "../shared-tree/index.js";

/**
 * Define a return type for table tree creation.
 */
export interface TableTreeDefinition {
	/**
	 * The table tree instance.
	 */
	table: InstanceType<typeof Table>;
	/**
	 * The undo stack for the table tree.
	 */
	undoStack: Revertible[];
	/**
	 * The redo stack for the table tree.
	 */
	redoStack: Revertible[];
	/**
	 * Unsubscribe from the table tree events and dispose of the undo/redo stacks.
	 */
	unsubscribe: () => void;
}

/**
 * Factory for creating a table tree schema.
 * This factory is used to create the schema for the table tree, including cells, columns,
 * rows, and the table itself.
 */
const schemaFactory = new SchemaFactoryAlpha("test");

/**
 * Defines the schema for a table cell.
 */
export class Cell extends schemaFactory.object("table-cell", {
	cellValue: schemaFactory.string,
}) {}

/**
 * Defines the schema for a table column.
 */
export class Column extends TableSchema.column({
	schemaFactory,
	cell: Cell,
}) {}

/**
 * Defines the schema for a table row.
 */
export class Row extends TableSchema.row({
	schemaFactory,
	cell: Cell,
}) {}

/**
 * Defines the schema for a table, which includes columns and rows.
 * It uses the previously defined Cell, Column, and Row schemas.
 */
export class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}

/**
 * Provides a simple table tree initialized with the specified size and cell value.
 * This helper function creates a table schema, initializes a SharedTree instance,
 * and populates it with the specified number of rows and columns.
 * Each cell is initialized with the provided cell value.
 *
 * @param tableSize - The number of rows and columns to create in the table.
 * @param cellValue - The initial value to set in each cell of the table.
 * @returns A fully initialized table tree definition, including table instance, undo/redo stacks, and a cleanup function.
 */
export function createTableTree(tableSize: number, cellValue: string): TableTreeDefinition {
	const sharedTreeFactory = DefaultTestSharedTreeKind.getFactory();
	const runtime = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
		attachState: AttachState.Detached,
	});
	const tree = sharedTreeFactory.create(runtime, "tree");
	const treeView = tree.viewWith(
		new TreeViewConfiguration({
			schema: Table,
			enableSchemaValidation: true,
		}),
	);

	treeView.initialize(Table.empty());
	const undoStack: Revertible[] = [];
	const redoStack: Revertible[] = [];

	function onDispose(disposed: Revertible): void {
		const redoIndex = redoStack.indexOf(disposed);
		if (redoIndex !== -1) {
			redoStack.splice(redoIndex, 1);
		} else {
			const undoIndex = undoStack.indexOf(disposed);
			if (undoIndex !== -1) {
				undoStack.splice(undoIndex, 1);
			}
		}
	}

	const unsubscribeFromCommitAppliedEvent = treeView.events.on(
		"commitApplied",
		(commit, getRevertible) => {
			if (getRevertible !== undefined) {
				const revertible = getRevertible(onDispose);
				if (commit.kind === CommitKind.Undo) {
					redoStack.push(revertible);
				} else {
					undoStack.push(revertible);
				}
			}
		},
	);
	const unsubscribe = (): void => {
		unsubscribeFromCommitAppliedEvent();
		for (const revertible of undoStack) {
			revertible.dispose();
		}
		for (const revertible of redoStack) {
			revertible.dispose();
		}
	};

	const table = treeView.root;
	for (let i = 0; i < tableSize; i++) {
		const column = new Column({ id: `column-${i}` });
		table.insertColumn({ index: i, column });
	}
	for (let i = 0; i < tableSize; i++) {
		const row = new Row({ id: `row-${i}`, cells: {} });
		table.insertRow({ index: i, row });
	}
	for (let i = 0; i < tableSize; i++) {
		for (let j = 0; j < tableSize; j++) {
			table.setCell({
				key: {
					column: `column-${i}`,
					row: `row-${j}`,
				},
				cell: { cellValue },
			});
		}
	}

	return {
		table,
		undoStack,
		redoStack,
		unsubscribe,
	};
}

/**
 * Currently table schema does not support removing cells when a column is removed.
 * This function provides a way to remove a column and its associated cells from the table. Might remove in the future
 * if the table schema is updated to handle this automatically.
 */
export function removeColumnAndCells(
	table: InstanceType<typeof Table>,
	columnId: string,
): void {
	Tree.runTransaction(table, () => {
		const column = table.getColumn(columnId);
		assert(column !== undefined, `Column with ID "${columnId}" does not exist.`);
		table.removeColumn(column);
		for (const row of table.rows) {
			table.removeCell({ column, row });
		}
	});
}
