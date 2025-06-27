/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/legacy";
import {
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type TreeNodeFromImplicitAllowedTypes,
	type TreeView,
} from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import { DefaultTestSharedTreeKind } from "./utils.js";
import { AttachState } from "@fluidframework/container-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { CommitKind, type Revertible } from "../core/index.js";
import { Tree } from "../shared-tree/index.js";
import assert from "node:assert";

/**
 * Define a return type for table tree creation.
 */
export interface TableTreeDefinition {
	/**
	 * The table tree instance.
	 */
	table: TreeNodeFromImplicitAllowedTypes<typeof Table>;
	/**
	 * The tree view associated with the table.
	 */
	treeView: TreeView<typeof Table>;
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
export const Cell = schemaFactory.string;

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
	const table = treeView.root;
	for (let i = 0; i < tableSize; i++) {
		const column = new Column({});
		table.insertColumn({ index: i, column });
	}
	for (let i = 0; i < tableSize; i++) {
		const row = new Row({ cells: {} });
		table.insertRow({ index: i, row });
	}
	for (const row of table.rows) {
		for (const column of table.columns) {
			table.setCell({
				key: {
					column,
					row,
				},
				cell: cellValue,
			});
		}
	}

	return {
		table,
		treeView,
	};
}

/**
 * Currently table schema does not support removing cells when a column is removed.
 * This function provides a way to remove a column and its associated cells from the table. Might remove in the future
 * if the table schema is updated to handle this automatically.
 */
export function removeColumnAndCells(table: InstanceType<typeof Table>, column: Column): void {
	Tree.runTransaction(table, () => {
		table.removeColumn(column);
		for (const row of table.rows) {
			table.removeCell({ column, row });
		}
	});
}

/**
 * Undo/Redo manager for a table tree.
 * This class manages the undo and redo operations for a table tree, allowing users to revert changes
 * and reapply them as needed. It listens to commit events from the tree view and maintains stacks
 * for undo and redo operations.
 */
export class UndoRedoManager {
	private readonly unsubscribeFromTreeEvents: () => void;

	private undoStack: Revertible[] = [];
	private redoStack: Revertible[] = [];

	public get canUndo(): boolean {
		return this.undoStack.length > 0;
	}
	public get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	public constructor(treeView: TreeView<typeof Table>) {
		this.unsubscribeFromTreeEvents = treeView.events.on(
			"commitApplied",
			(commit, getRevertible) => {
				if (getRevertible === undefined) {
					return;
				}
				const revertible = getRevertible();
				if (commit.kind === CommitKind.Undo) {
					// If the new commit is an undo, push it to the redo stack.
					this.redoStack.push(revertible);
				} else {
					if (commit.kind === CommitKind.Default) {
						// If the new commit is not an undo/redo, clear the redo stack.
						for (const redo of this.redoStack) {
							redo.dispose();
						}
						this.redoStack = [];
					}
					this.undoStack.push(revertible);
				}
			},
		);
	}

	public undo(): void {
		const revertible = this.undoStack.pop();
		assert(revertible !== undefined);
		revertible.revert();
	}

	public redo(): void {
		const revertible = this.redoStack.pop();
		assert(revertible !== undefined);
		revertible.revert();
	}

	public dispose(): void {
		// Dispose of undo/redo stacks
		for (const undo of this.undoStack) {
			undo.dispose();
		}
		this.undoStack = [];
		for (const redo of this.redoStack) {
			redo.dispose();
		}
		this.redoStack = [];

		// Unsubscribe from tree events
		this.unsubscribeFromTreeEvents();
	}
}
