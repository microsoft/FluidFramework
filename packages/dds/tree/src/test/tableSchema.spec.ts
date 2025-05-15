/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import { independentView, TreeAlpha } from "../shared-tree/index.js";
import {
	allowUnused,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ConciseTree,
	type TreeNode,
} from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import type { areSafelyAssignable, requireTrue } from "../util/index.js";
import { validateUsageError } from "./utils.js";

const schemaFactory = new SchemaFactoryAlpha("test");

describe("TableFactory unit tests", () => {
	function createTableTree() {
		class Cell extends schemaFactory.object("table-cell", {
			value: schemaFactory.string,
		}) {}

		class ColumnProps extends schemaFactory.object("table-column-props", {
			/**
			 * Label text for the column.
			 */
			label: schemaFactory.optional(schemaFactory.string),
		}) {}
		class Column extends TableSchema.column({
			schemaFactory,
			Cell,
			Props: ColumnProps,
		}) {}

		class RowProps extends schemaFactory.object("table-row-props", {
			/**
			 * Whether or not the row is selectable.
			 * @defaultValue `true`
			 */
			selectable: schemaFactory.optional(schemaFactory.boolean),
		}) {}
		class Row extends TableSchema.row({
			schemaFactory,
			Cell,
			Props: schemaFactory.optional(RowProps),
		}) {}

		class Table extends TableSchema.table({
			schemaFactory,
			Cell,
			Column,
			Row,
		}) {}

		const treeView = independentView(
			new TreeViewConfiguration({
				schema: Table,
				enableSchemaValidation: true,
			}),
			{ idCompressor: createIdCompressor() },
		);

		return {
			Cell,
			Column,
			Row,
			Table,
			treeView,
		};
	}

	/**
	 * Compares a tree with an expected "concise" tree representation.
	 * Fails if they are not equivalent.
	 */
	function assertEqualTrees(actual: TreeNode, expected: ConciseTree): void {
		const actualVerbose = TreeAlpha.exportConcise(actual);
		assert.deepEqual(actualVerbose, expected);
	}

	describe("Column Schema", () => {
		it("Can create without props", () => {
			class Column extends TableSchema.column({ schemaFactory, Cell: schemaFactory.string }) {}
			const column = new Column({ id: "column-0" });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, Column["props"]>>;
			assert.equal(column.props, undefined);
		});

		it("Can create with props", () => {
			class Column extends TableSchema.column({
				schemaFactory,
				Cell: schemaFactory.string,
				Props: schemaFactory.string,
			}) {}
			const column = new Column({ id: "column-0", props: "Column 0" });
			assert.equal(column.props, "Column 0");
		});

		it("getCells", () => {
			const { treeView, Table, Column } = createTableTree();
			treeView.initialize(Table.empty());
			const table = treeView.root;

			// Calling `getCells` on a column that has not been inserted into the table throws an error.
			const column0 = new Column({ id: "column-0", props: {} });
			assert.throws(
				() => column0.getCells(),
				validateUsageError(/Column with ID "column-0" is not contained in a table./),
			);

			table.insertColumn({ column: column0 });

			// No rows or cells have been inserted yet.
			assert.equal(column0.getCells().length, 0);

			table.insertRows({
				rows: [
					{ id: "row-0", cells: {} },
					{ id: "row-1", cells: {} },
					{ id: "row-2", cells: {} },
				],
			});
			table.setCell({
				key: {
					column: column0,
					row: "row-0",
				},
				cell: { value: "0-0" },
			});
			table.setCell({
				key: {
					column: column0,
					row: "row-2",
				},
				cell: { value: "2-0" },
			});

			const cells = column0.getCells();
			assert.equal(cells.length, 2);
			assert.equal(cells[0].rowId, "row-0");
			assertEqualTrees(cells[0].cell, { value: "0-0" });
			assert.equal(cells[1].rowId, "row-2");
			assertEqualTrees(cells[1].cell, { value: "2-0" });
		});
	});

	describe("Row Schema", () => {
		it("Can create without props", () => {
			class Cell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class Row extends TableSchema.row({ schemaFactory, Cell }) {}
			const row = new Row({ id: "row-0", cells: {} });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, Row["props"]>>;
			assert.equal(row.props, undefined);
		});

		it("Can create with props", () => {
			class Cell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class Row extends TableSchema.row({
				schemaFactory,
				Cell,
				Props: schemaFactory.string,
			}) {}
			const column = new Row({ id: "row-0", cells: {}, props: "Row 0" });
			assert.equal(column.props, "Row 0");
		});

		it("getCells", () => {
			const { treeView, Table, Row } = createTableTree();
			treeView.initialize(Table.empty());
			const table = treeView.root;

			const row = new Row({ id: "row-0", cells: {} });
			table.insertRow({ row });

			// No columns or cells have been inserted yet.
			assert.equal(row.getCells().length, 0);

			table.insertColumns({
				columns: [
					{ id: "column-0", props: { label: "Column 0" } },
					{ id: "column-1", props: { label: "Column 0" } },
					{ id: "column-2", props: { label: "Column 0" } },
				],
			});
			table.setCell({
				key: {
					row: row.id,
					column: "column-0",
				},
				cell: { value: "0-0" },
			});
			table.setCell({
				key: {
					row: row.id,
					column: "column-2",
				},
				cell: { value: "0-2" },
			});

			const cells = row.getCells();
			assert.equal(cells.length, 2);
			assert.equal(cells[0].columnId, "column-0");
			assertEqualTrees(cells[0].cell, { value: "0-0" });
			assert.equal(cells[1].columnId, "column-2");
			assertEqualTrees(cells[1].cell, { value: "0-2" });
		});
	});

	describe("Table Schema", () => {
		it("Can create without custom column/row schema", () => {
			class Table extends TableSchema.table({
				schemaFactory,
				Cell: schemaFactory.string,
			}) {}

			const _table = new Table({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});
		});

		it("Can create with custom column schema", () => {
			const Cell = schemaFactory.string;
			class Column extends TableSchema.column({
				schemaFactory,
				Cell,
				Props: schemaFactory.object("column-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class Table extends TableSchema.table({
				schemaFactory,
				Cell,
				Column,
			}) {}

			const _table = new Table({
				columns: [{ id: "column-0", props: { label: "Column 0" } }],
				rows: [{ id: "row-0", cells: {} }],
			});
		});

		it("Can create with custom row schema", () => {
			const Cell = schemaFactory.string;
			class Row extends TableSchema.row({
				schemaFactory,
				Cell,
				Props: schemaFactory.object("row-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class Table extends TableSchema.table({
				schemaFactory,
				Cell: schemaFactory.string,
				Row,
			}) {}

			const _table = new Table({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
			});
		});

		it("Can create with custom column and row schema", () => {
			const Cell = schemaFactory.string;
			class Column extends TableSchema.column({
				schemaFactory,
				Cell,
				Props: schemaFactory.object("column-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class Row extends TableSchema.row({
				schemaFactory,
				Cell,
				Props: schemaFactory.object("row-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class Table extends TableSchema.table({
				schemaFactory,
				Cell: schemaFactory.string,
				Column,
				Row,
			}) {}

			const _table = new Table({
				columns: [{ id: "column-0", props: { label: "Column 0" } }],
				rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
			});
		});
	});

	describe("Initialization", () => {
		it("Empty", () => {
			class Table extends TableSchema.table({
				schemaFactory,
				Cell: schemaFactory.string,
			}) {
				// Custom property on derived class included to verify that the
				// return type of `Table.empty()` is correct.
				public customProp: string = "Hello world!";
			}

			const table: Table = Table.empty();
			assertEqualTrees(table, { columns: [], rows: [] });
			assert(table.customProp === "Hello world!");
		});

		it("Non-empty", () => {
			const { treeView, Table, Column } = createTableTree();

			treeView.initialize(
				new Table({
					columns: [
						new Column({
							id: "column-0",
							props: {
								label: "Column 0",
							},
						}),
						new Column({ id: "column-1", props: { label: "Column 1" } }),
					],
					rows: [
						{ id: "row-0", cells: {} },
						{
							id: "row-1",
							cells: {
								"column-1": { value: "Hello world!" },
							},
						},
					],
				}),
			);

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: { label: "Column 0" },
					},
					{
						id: "column-1",
						props: { label: "Column 1" },
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
			});
		});
	});

	describe("insertColumn", () => {
		it("Insert new column into empty list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertColumn({
				index: 0,
				column: { id: "column-0", props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [],
			});
		});

		it("Insert new column into non-empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [],
				columns: [
					{ id: "column-a", props: {} },
					{ id: "column-b", props: {} },
				],
			});

			treeView.root.insertColumn({
				index: 1,
				column: { id: "column-c", props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-c",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
				],
				rows: [],
			});
		});

		it("Append new column", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [],
				columns: [
					{ id: "column-a", props: {} },
					{ id: "column-b", props: {} },
				],
			});

			// By not specifying an index, the column should be appended to the end of the list.
			treeView.root.insertColumn({
				column: { id: "column-c", props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
					{
						id: "column-c",
						props: {},
					},
				],
				rows: [],
			});
		});

		it("Inserting column at out-of-bounds index fails", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			assert.throws(
				() =>
					treeView.root.insertColumn({
						index: 1,
						column: { props: {} },
					}),
				validateUsageError(/The index specified for insertion is out of bounds./),
			);
		});
	});

	describe("insertColumns", () => {
		it("Insert empty columns list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertColumns({ index: 0, columns: [] });

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Insert single column into empty list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertColumns({
				index: 0,
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [],
			});
		});

		it("Insert columns into non-empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
				],
				rows: [],
			});

			treeView.root.insertColumns({
				index: 1,
				columns: [
					{
						id: "column-c",
						props: {},
					},
					{
						id: "column-d",
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-c",
						props: {},
					},
					{
						id: "column-d",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
				],
				rows: [],
			});
		});

		it("Append columns", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
				],
				rows: [],
			});

			treeView.root.insertColumns({
				columns: [
					{
						id: "column-c",
						props: {},
					},
					{
						id: "column-d",
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
						props: {},
					},
					{
						id: "column-b",
						props: {},
					},
					{
						id: "column-c",
						props: {},
					},
					{
						id: "column-d",
						props: {},
					},
				],
				rows: [],
			});
		});
	});

	describe("insertRow", () => {
		it("Insert new row into empty list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertRow({
				index: 0,
				row: { id: "row-0", cells: {}, props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Insert new row into non-empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [
					{ id: "row-a", cells: {}, props: {} },
					{ id: "row-b", cells: {}, props: {} },
				],
			});

			treeView.root.insertRow({
				index: 1,
				row: { id: "row-c", cells: {}, props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-c",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Append new row", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [
					{ id: "row-a", cells: {}, props: {} },
					{ id: "row-b", cells: {}, props: {} },
				],
			});

			// By not specifying an index, the column should be appended to the end of the list.
			treeView.root.insertRow({
				row: { id: "row-c", cells: {}, props: {} },
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
					{
						id: "row-c",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Inserting row at out-of-bounds index fails", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() =>
					treeView.root.insertRow({
						index: 1,
						row: { cells: {}, props: {} },
					}),
				validateUsageError(/The index specified for insertion is out of bounds./),
			);
		});

		it("Inserting a row with cells that have no matching column fails", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [],
				columns: [{ id: "column-a", props: {} }],
			});

			assert.throws(
				() =>
					treeView.root.insertRow({
						row: {
							id: "row-a",
							cells: {
								"column-a": { value: "Hello" },
								"column-b": { value: "world!" },
							},
						},
					}),
				validateUsageError(
					/Attempted to insert row a cell under column ID "column-b", but the table does not contain a column with that ID./,
				),
			);

			// Ensure the row was not inserted
			assert(treeView.root.rows.length === 0);
		});
	});

	describe("insertRows", () => {
		it("Insert empty rows list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertRows({ index: 0, rows: [] });

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Insert single row into empty list", () => {
			const { treeView, Table } = createTableTree();
			treeView.initialize(Table.empty());

			treeView.root.insertRows({
				index: 0,
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Insert rows into non-empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
				],
				columns: [],
			});

			treeView.root.insertRows({
				index: 1,
				rows: [
					{
						id: "row-c",
						cells: {},
						props: {},
					},
					{
						id: "row-d",
						cells: {},
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-c",
						cells: {},
						props: {},
					},
					{
						id: "row-d",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Append rows", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
				],
				columns: [],
			});

			treeView.root.insertRows({
				rows: [
					{
						id: "row-c",
						cells: {},
						props: {},
					},
					{
						id: "row-d",
						cells: {},
						props: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
						props: {},
					},
					{
						id: "row-b",
						cells: {},
						props: {},
					},
					{
						id: "row-c",
						cells: {},
						props: {},
					},
					{
						id: "row-d",
						cells: {},
						props: {},
					},
				],
			});
		});
	});

	describe("setCell", () => {
		it("Set cell in a valid location", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			// By not specifying an index, the column should be appended to the end of the list.
			treeView.root.setCell({
				key: {
					row: "row-0",
					column: "column-0",
				},
				cell: { value: "Hello world!" },
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {
							"column-0": {
								value: "Hello world!",
							},
						},
						props: {},
					},
				],
			});
		});

		it("Setting cell in an invalid location errors", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			// Invalid row
			assert.throws(
				() =>
					treeView.root.setCell({
						key: {
							row: "row-1",
							column: "column-0",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/No row with ID "row-1" exists in the table./),
			);

			// Invalid column
			assert.throws(
				() =>
					treeView.root.setCell({
						key: {
							row: "row-0",
							column: "column-1",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/No column with ID "column-1" exists in the table./),
			);
		});
	});

	describe("removeColumn", () => {
		it("Remove column by ID", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: { label: "Column 0" },
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			const removed = treeView.root.removeColumn("column-0");
			assertEqualTrees(removed, {
				id: "column-0",
				props: { label: "Column 0" },
			});
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Remove column by node", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: { label: "Column 0" },
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			const removed = treeView.root.removeColumn(treeView.root.columns[0]);
			assertEqualTrees(removed, {
				id: "column-0",
				props: { label: "Column 0" },
			});
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Removing column that does not exist on table errors", () => {
			const { treeView, Column } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.removeColumn(new Column({ id: "unhydrated-column", props: {} })),
				validateUsageError(
					/Specified column with ID "unhydrated-column" does not exist in the table./,
				),
			);
		});
	});

	describe("removeRows", () => {
		it("Remove empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			treeView.root.removeAllRows();
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Remove single row", () => {
			const { treeView, Row } = createTableTree();
			const row0 = new Row({ id: "row-0", cells: {}, props: {} });
			const row1 = new Row({ id: "row-1", cells: {}, props: {} });
			treeView.initialize({
				columns: [],
				rows: [row0, row1],
			});

			// Remove row0
			treeView.root.removeRows([row0]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [{ id: "row-1", cells: {}, props: {} }],
			});

			// Remove row1
			treeView.root.removeRows([row1]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Remove multiple rows", () => {
			const { treeView, Row } = createTableTree();
			const row0 = new Row({ id: "row-0", cells: {}, props: {} });
			const row1 = new Row({ id: "row-1", cells: {}, props: {} });
			const row2 = new Row({ id: "row-2", cells: {}, props: {} });
			const row3 = new Row({ id: "row-3", cells: {}, props: {} });
			treeView.initialize({
				columns: [],
				rows: [row0, row1, row2, row3],
			});

			// Remove rows 1 and 3
			treeView.root.removeRows([row1, row3]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
					{
						id: "row-2",
						cells: {},
						props: {},
					},
				],
			});

			// Remove rows 0 and 3
			treeView.root.removeRows([row0, row2]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Removing single row that doesn't exist on table errors", () => {
			const { treeView, Row } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.removeRows([new Row({ id: "row-0", cells: {}, props: {} })]),
				validateUsageError(/Specified row with ID "row-0" does not exist in the table./),
			);
		});

		it("Removing multiple rows errors if at least one row doesn't exist", () => {
			const { treeView, Row } = createTableTree();
			const row0 = new Row({ id: "row-0", cells: {}, props: {} });
			treeView.initialize({
				columns: [],
				rows: [row0],
			});

			assert.throws(
				() => treeView.root.removeRows([row0, new Row({ id: "row-1", cells: {}, props: {} })]),
				validateUsageError(/Specified row with ID "row-1" does not exist in the table./),
			);

			// Additionally, `row-0` should not have been removed.
			assert(treeView.root.rows.length === 1);
		});
	});

	describe("removeCell", () => {
		it("Remove cell in valid location with existing data", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
			const cellKey = {
				row: "row-0",
				column: "column-0",
			};
			treeView.root.setCell({
				key: cellKey,
				cell: { value: "Hello world!" },
			});
			treeView.root.removeCell(cellKey);
			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Remove cell in valid location with no data", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
			const cellKey = {
				row: "row-0",
				column: "column-0",
			};
			treeView.root.removeCell(cellKey);
			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Removing cell from nonexistent row and column errors", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			// Invalid row
			assert.throws(
				() =>
					treeView.root.removeCell({
						row: "row-1",
						column: "column-0",
					}),
				validateUsageError(/Specified row with ID "row-1" does not exist in the table./),
			);

			// Invalid column
			assert.throws(
				() =>
					treeView.root.removeCell({
						row: "row-0",
						column: "column-1",
					}),
				validateUsageError(/Specified column with ID "column-1" does not exist in the table./),
			);
		});
	});

	it("Gets proper table elements with getter methods", () => {
		const { treeView, Column, Row, Cell } = createTableTree();

		const cell0 = new Cell({ value: "Hello World!" });
		const column0 = new Column({ id: "column-0", props: {} });
		const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });

		treeView.initialize({
			columns: [column0],
			rows: [row0],
		});

		const cell = treeView.root.getCell({ column: "column-0", row: "row-0" });
		const column = treeView.root.getColumn("column-0");
		const row = treeView.root.getRow("row-0");

		assert.equal(cell, cell0);
		assert.equal(row, row0);
		assert.equal(column, column0);
	});

	// The code within the following tests is included in TSDoc comments in the source code.
	// If you need to update any of these, please update the corresponding TSDoc comments as well.
	describe("TSDoc comment examples", () => {
		it("TableSchema: Default Column and Row schema", () => {
			class Cell extends schemaFactory.object("TableCell", {
				value: schemaFactory.string,
			}) {}

			class Table extends TableSchema.table({
				schemaFactory,
				Cell,
			}) {}

			const table = new Table({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});

		it("TableSchema: Customizing Column and Row schema", () => {
			class Cell extends schemaFactory.object("TableCell", {
				value: schemaFactory.string,
			}) {}

			class ColumnProps extends schemaFactory.object("TableColumnProps", {
				// Column label to display.
				label: schemaFactory.string,
				// The type of data represented by the cells. Default: string.
				dataType: schemaFactory.optional(schemaFactory.string),
			}) {}

			class Column extends TableSchema.column({
				schemaFactory,
				Cell,
				Props: ColumnProps,
			}) {}

			class Row extends TableSchema.row({
				schemaFactory,
				Cell,
			}) {}

			class Table extends TableSchema.table({
				schemaFactory,
				Cell,
				Column,
				Row,
			}) {}

			const table = new Table({
				columns: [
					new Column({ props: { label: "Entry", dataType: "string" } }),
					new Column({ props: { label: "Date", dataType: "date" } }),
					new Column({ props: { label: "Amount", dataType: "number" } }),
				],
				rows: [],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});
	});
});
