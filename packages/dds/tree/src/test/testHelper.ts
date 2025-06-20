/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/legacy";
import { SchemaFactoryAlpha, TreeViewConfiguration } from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import { DefaultTestSharedTreeKind } from "./utils.js";
import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";
import { CommitKind, type Revertible } from "../core/index.js";

/**
 * Define a return type for table tree creation.
 */
export interface TableTreeDefinition {
	/**
	 * The cell class used to define the table tree schema.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Cell: any;
	/**
	 * The column class used to define the table tree schema.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Column: any;
	/**
	 * The row class used to define the table tree schema.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Row: any;
	/**
	 * The table class used to define the table tree schema.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Table: any;
	/**
	 * The table tree instance.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	table: any;
	/**
	 * The undo stack for the table tree.
	 */
	undoStack: Revertible[];
	/**
	 * The redo stack for the table tree.
	 * */
	redoStack: Revertible[];
	/**
	 * Unsubscribe from the table tree events and dispose of the undo/redo stacks.
	 */
	unsubscribe: () => void;
}

/**
 * Provides a simple table tree with the given size and cell value.
 */
export function createTableTree(tableSize: number, cellValue: string): TableTreeDefinition {
	const schemaFactory = new SchemaFactoryAlpha("test");
	class Cell extends schemaFactory.object("table-cell", {
		cellValue: schemaFactory.string,
	}) {}

	class Column extends TableSchema.column({
		schemaFactory,
		cell: Cell,
	}) {}

	class Row extends TableSchema.row({
		schemaFactory,
		cell: Cell,
	}) {}

	class Table extends TableSchema.table({
		schemaFactory,
		cell: Cell,
		column: Column,
		row: Row,
	}) {}

	const sharedTreeFactory = DefaultTestSharedTreeKind.getFactory();
	const runtime = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
		attachState: AttachState.Detached,
	});
	const tree = sharedTreeFactory.create(runtime, "tree");
	const runtimeFactory = new MockContainerRuntimeFactory();
	runtimeFactory.createContainerRuntime(runtime);

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
	const result: TableTreeDefinition = {
		Cell,
		Column,
		Row,
		Table,
		table,
		undoStack,
		redoStack,
		unsubscribe,
	};
	return result;
}
