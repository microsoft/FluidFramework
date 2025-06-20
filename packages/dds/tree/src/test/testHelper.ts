/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/legacy";
import { independentView } from "../shared-tree/index.js";
import { SchemaFactoryAlpha, TreeViewConfiguration } from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";

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

	const treeView = independentView(
		new TreeViewConfiguration({
			schema: Table,
			enableSchemaValidation: true,
		}),
		{ idCompressor: createIdCompressor() },
	);

	treeView.initialize(Table.empty());
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
	};
	return result;
}
