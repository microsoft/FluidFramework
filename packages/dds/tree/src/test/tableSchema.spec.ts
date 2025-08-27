/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { Tree, TreeAlpha } from "../shared-tree/index.js";
import {
	allowUnused,
	getJsonSchema,
	KeyEncodingOptions,
	SchemaFactoryAlpha,
	type ConciseTree,
	type TreeNode,
} from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import type {
	areSafelyAssignable,
	JsonCompatibleReadOnly,
	requireTrue,
} from "../util/index.js";
import { validateUsageError } from "./utils.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshots/index.js";
// eslint-disable-next-line import/no-internal-modules
import { describeHydration } from "./simple-tree/utils.js";

const schemaFactory = new SchemaFactoryAlpha("test");

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
	cell: Cell,
	props: ColumnProps,
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
	cell: Cell,
	props: schemaFactory.optional(RowProps),
}) {}

class Table extends TableSchema.table({
	schemaFactory,
	cell: Cell,
	column: Column,
	row: Row,
}) {}

describe("TableFactory unit tests", () => {
	/**
	 * Compares a tree with an expected "concise" tree representation.
	 * Fails if they are not equivalent.
	 */
	function assertEqualTrees(actual: TreeNode, expected: ConciseTree): void {
		const actualVerbose = TreeAlpha.exportConcise(actual);
		assert.deepEqual(actualVerbose, expected);
	}

	describeHydration("Column Schema", (initializeTree) => {
		it("Can create without props", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}
			const column = new MyColumn({ id: "column-0" });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, MyColumn["props"]>>;
			assert.equal(column.props, undefined);
		});

		it("Can create with props", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: schemaFactory.string,
				props: schemaFactory.string,
			}) {}
			const column = new MyColumn({ id: "column-0", props: "Column 0" });
			assert.equal(column.props, "Column 0");
		});

		it("getCells", () => {
			const table = initializeTree(Table, Table.empty());

			// Calling `getCells` on a column that has not been inserted into the table throws an error.
			const column0 = new Column({ id: "column-0", props: {} });
			assert.throws(
				() => column0.getCells(),
				validateUsageError(/Column with ID "column-0" is not contained in a table./),
			);

			table.insertColumns({ columns: [column0] });

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

	describeHydration("Row Schema", (initializeTree) => {
		it("Can create without props", () => {
			class MyCell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class MyRow extends TableSchema.row({ schemaFactory, cell: MyCell }) {}
			const row = new MyRow({ id: "row-0", cells: {} });

			// TODO: ideally the "props" property would not exist at all on the derived class.
			// For now, it is at least an optional property and cannot be set to anything meaningful.
			type _test = requireTrue<areSafelyAssignable<undefined, MyRow["props"]>>;
			assert.equal(row.props, undefined);
		});

		it("Can create with props", () => {
			class MyCell extends schemaFactory.object("table-cell", {
				value: schemaFactory.string,
			}) {}
			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.string,
			}) {}

			const column = initializeTree(MyRow, { id: "row-0", cells: {}, props: "Row 0" });
			assert.equal(column.props, "Row 0");
		});

		it("getCells", () => {
			const table = initializeTree(Table, Table.empty());

			const row = new Row({ id: "row-0", cells: {} });
			table.insertRows({ rows: [row] });

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
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const _table = new MyTable({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});
		});

		it("Can create with custom column schema", () => {
			const MyCell = schemaFactory.string;
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.object("column-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: MyCell,
				column: MyColumn,
			}) {}

			const _table = new MyTable({
				columns: [{ id: "column-0", props: { label: "Column 0" } }],
				rows: [{ id: "row-0", cells: {} }],
			});
		});

		it("Can create with custom row schema", () => {
			const MyCell = schemaFactory.string;
			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.object("row-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
				row: MyRow,
			}) {}

			const _table = new MyTable({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
			});
		});

		it("Can create with custom column and row schema", () => {
			const MyCell = schemaFactory.string;
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.object("column-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: MyCell,
				props: schemaFactory.object("row-props", {
					label: schemaFactory.string,
				}),
			}) {}
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
				column: MyColumn,
				row: MyRow,
			}) {}

			const _table = new MyTable({
				columns: [{ id: "column-0", props: { label: "Column 0" } }],
				rows: [{ id: "row-0", props: { label: "Row 0" }, cells: {} }],
			});
		});
	});

	describeHydration("Initialization", (initializeTree) => {
		it("Empty", () => {
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {
				// Custom property on derived class included to verify that the
				// return type of `Table.empty()` is correct.
				public customProp: string = "Hello world!";
			}

			const table = initializeTree(MyTable, MyTable.empty());
			assertEqualTrees(table, { columns: [], rows: [] });
			assert(table.customProp === "Hello world!");
		});

		it("Non-empty", () => {
			const table = initializeTree(
				Table,
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

			assertEqualTrees(table, {
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

	describeHydration("insertColumns", (initializeTree) => {
		it("Insert empty columns list", () => {
			const tree = initializeTree(Table, Table.empty());

			tree.insertColumns({ index: 0, columns: [] });

			assertEqualTrees(tree, {
				columns: [],
				rows: [],
			});
		});

		it("Insert single column into empty list", () => {
			const table = initializeTree(Table, Table.empty());

			table.insertColumns({
				index: 0,
				columns: [
					{
						id: "column-0",
						props: {},
					},
				],
			});

			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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

			table.insertColumns({
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

			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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

			table.insertColumns({
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

			assertEqualTrees(table, {
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

	describeHydration("insertRows", (initializeTree) => {
		it("Insert empty rows list", () => {
			const table = initializeTree(Table, Table.empty());

			table.insertRows({ index: 0, rows: [] });

			assertEqualTrees(table, {
				columns: [],
				rows: [],
			});
		});

		it("Insert single row into empty list", () => {
			const table = initializeTree(Table, Table.empty());

			table.insertRows({
				index: 0,
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
				],
			});

			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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

			table.insertRows({
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

			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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

			table.insertRows({
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

			assertEqualTrees(table, {
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

	describeHydration("setCell", (initializeTree) => {
		it("Set cell in a valid location", () => {
			const table = initializeTree(Table, {
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
			table.setCell({
				key: {
					row: "row-0",
					column: "column-0",
				},
				cell: { value: "Hello world!" },
			});

			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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
					table.setCell({
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
					table.setCell({
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

	describeHydration("removeColumns", (initializeTree, hydrated) => {
		it("Remove empty list", () => {
			const table = initializeTree(Table, {
				columns: [
					new Column({
						id: "column-0",
						props: {},
					}),
				],
				rows: [
					new Row({
						id: "row-0",
						cells: {
							"column-0": { value: "Hello world!" },
						},
						props: {},
					}),
				],
			});

			table.removeColumns([]);
			assertEqualTrees(table, {
				columns: [{ id: "column-0", props: {} }],
				rows: [
					{
						id: "row-0",
						cells: {
							"column-0": { value: "Hello world!" },
						},
						props: {},
					},
				],
			});
		});

		it("Remove empty range", () => {
			const table = initializeTree(Table, {
				columns: [new Column({ id: "column-0", props: {} })],
				rows: [],
			});

			table.removeColumns(0, 0);
			assertEqualTrees(table, {
				columns: [{ id: "column-0", props: {} }],
				rows: [],
			});
		});

		// TODO:AB#47404: Fix column removal for unhydrated table trees and re-enable in unhydrated mode.
		if (hydrated) {
			it("Remove single column", () => {
				const column0 = new Column({ id: "column-0", props: {} });
				const column1 = new Column({ id: "column-1", props: {} });
				const table = initializeTree(Table, {
					columns: [column0, column1],
					rows: [
						new Row({
							id: "row-0",
							cells: {
								"column-0": { value: "Hello world!" },
							},
							props: {},
						}),
					],
				});

				// Remove column0 (by node)
				table.removeColumns([column0]);
				assertEqualTrees(table, {
					columns: [{ id: "column-1", props: {} }],
					rows: [
						{
							id: "row-0",
							cells: {},
							props: {},
						},
					],
				});

				// Remove column1 (by ID)
				table.removeColumns(["column-1"]);
				assertEqualTrees(table, {
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

			it("Remove multiple columns", () => {
				const column0 = new Column({ id: "column-0", props: {} });
				const column1 = new Column({ id: "column-1", props: {} });
				const column2 = new Column({ id: "column-2", props: {} });
				const column3 = new Column({ id: "column-3", props: {} });
				const table = initializeTree(Table, {
					columns: [column0, column1, column2, column3],
					rows: [
						new Row({
							id: "row-0",
							cells: {
								"column-0": { value: "Hello world!" },
							},
							props: {},
						}),
					],
				});

				// Remove columns 1 and 3 (by node)
				table.removeColumns([column1, column3]);
				assertEqualTrees(table, {
					columns: [
						{ id: "column-0", props: {} },
						{ id: "column-2", props: {} },
					],
					rows: [
						{
							id: "row-0",
							cells: {
								"column-0": { value: "Hello world!" },
							},
							props: {},
						},
					],
				});

				// Remove columns 2 and 0 (by ID)
				table.removeColumns([column2.id, column0.id]);
				assertEqualTrees(table, {
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

			it("Remove columns by index range", () => {
				const column0 = new Column({ id: "column-0", props: {} });
				const column1 = new Column({ id: "column-1", props: {} });
				const column2 = new Column({ id: "column-2", props: {} });
				const column3 = new Column({ id: "column-3", props: {} });
				const table = initializeTree(Table, {
					columns: [column0, column1, column2, column3],
					rows: [
						new Row({
							id: "row-0",
							cells: {
								"column-0": { value: "Hello" },
								"column-2": { value: "world" },
							},
						}),
					],
				});

				// Remove columns 1-2
				table.removeColumns(1, 2);
				assertEqualTrees(table, {
					columns: [
						{ id: "column-0", props: {} },
						{ id: "column-3", props: {} },
					],
					rows: [
						{
							id: "row-0",
							cells: {
								"column-0": { value: "Hello" },
							},
						},
					],
				});
			});

			it("Removing a single column that doesn't exist on table errors", () => {
				const table = initializeTree(Table, {
					columns: [],
					rows: [],
				});

				assert.throws(
					() => table.removeColumns([new Column({ id: "column-0", props: {} })]),
					validateUsageError(
						/Specified column with ID "column-0" does not exist in the table./,
					),
				);
			});

			it("Removing multiple columns errors if at least one column doesn't exist", () => {
				const column0 = new Column({ id: "column-0", props: {} });
				const table = initializeTree(Table, {
					columns: [column0],
					rows: [],
				});

				assert.throws(
					() => table.removeColumns([column0, new Column({ id: "column-1", props: {} })]),
					validateUsageError(
						/Specified column with ID "column-1" does not exist in the table./,
					),
				);

				// Additionally, `column-0` should not have been removed.
				assert(table.columns.length === 1);
			});
		}

		it("Removing by range fails for invalid ranges", () => {
			const column0 = new Column({ id: "column-0", props: {} });
			const column1 = new Column({ id: "column-1", props: {} });
			const table = initializeTree(Table, {
				columns: [column0, column1],
				rows: [],
			});

			assert.throws(
				() => table.removeColumns(-1, undefined),
				validateUsageError(
					/Start index out of bounds. Expected index to be on \[0, 1], but got -1/,
				),
			);

			assert.throws(
				() => table.removeColumns(1, -1),
				validateUsageError(/Expected non-negative count. Got -1./),
			);

			assert.throws(
				() => table.removeColumns(0, 5),
				validateUsageError(
					/End index out of bounds. Expected end to be on \[0, 2], but got 5/,
				),
			);

			// Additionally, no columns should have been removed.
			assert(table.columns.length === 2);
		});
	});

	describeHydration("removeRows", (initializeTree, hydrated) => {
		it("Remove empty list", () => {
			const table = initializeTree(Table, {
				columns: [],
				rows: [
					new Row({
						id: "row-0",
						cells: {},
					}),
				],
			});

			table.removeRows([]);
			assertEqualTrees(table, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});
		});

		// TODO:AB#47404: Fix row removal for unhydrated table trees and re-enable in unhydrated mode.
		if (hydrated) {
			it("Remove single row", () => {
				const row0 = new Row({ id: "row-0", cells: {}, props: {} });
				const row1 = new Row({ id: "row-1", cells: {}, props: {} });
				const table = initializeTree(Table, {
					columns: [],
					rows: [row0, row1],
				});

				// Remove row0 (by node)
				table.removeRows([row0]);
				assertEqualTrees(table, {
					columns: [],
					rows: [{ id: "row-1", cells: {}, props: {} }],
				});

				// Remove row1 (by ID)
				table.removeRows(["row-1"]);
				assertEqualTrees(table, {
					columns: [],
					rows: [],
				});
			});

			it("Remove multiple rows", () => {
				const row0 = new Row({ id: "row-0", cells: {}, props: {} });
				const row1 = new Row({ id: "row-1", cells: {}, props: {} });
				const row2 = new Row({ id: "row-2", cells: {}, props: {} });
				const row3 = new Row({ id: "row-3", cells: {}, props: {} });
				const table = initializeTree(Table, {
					columns: [],
					rows: [row0, row1, row2, row3],
				});

				// Remove rows 1 and 3 (by node)
				table.removeRows([row1, row3]);
				assertEqualTrees(table, {
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

				// Remove rows 2 and 0 (by ID)
				table.removeRows([row2.id, row0.id]);
				assertEqualTrees(table, {
					columns: [],
					rows: [],
				});
			});

			it("Removing single row that doesn't exist on table errors", () => {
				const table = initializeTree(Table, {
					columns: [],
					rows: [],
				});

				assert.throws(
					() => table.removeRows([new Row({ id: "row-0", cells: {}, props: {} })]),
					validateUsageError(/Specified row with ID "row-0" does not exist in the table./),
				);
			});

			it("Removing multiple rows errors if at least one row doesn't exist", () => {
				const row0 = new Row({ id: "row-0", cells: {}, props: {} });
				const table = initializeTree(Table, {
					columns: [],
					rows: [row0],
				});

				assert.throws(
					() => table.removeRows([row0, new Row({ id: "row-1", cells: {}, props: {} })]),
					validateUsageError(/Specified row with ID "row-1" does not exist in the table./),
				);

				// Additionally, `row-0` should not have been removed.
				assert(table.rows.length === 1);
			});
		}

		it("Remove empty range", () => {
			const table = initializeTree(Table, {
				columns: [],
				rows: [new Row({ id: "row-0", cells: {}, props: {} })],
			});

			table.removeRows(0, 0);
			assertEqualTrees(table, {
				columns: [],
				rows: [{ id: "row-0", cells: {}, props: {} }],
			});
		});

		it("Remove by index range", () => {
			const row0 = new Row({ id: "row-0", cells: {}, props: {} });
			const row1 = new Row({ id: "row-1", cells: {}, props: {} });
			const row2 = new Row({ id: "row-2", cells: {}, props: {} });
			const row3 = new Row({ id: "row-3", cells: {}, props: {} });
			const table = initializeTree(Table, {
				columns: [],
				rows: [row0, row1, row2, row3],
			});

			// Remove rows 1-2
			table.removeRows(1, 2);
			assertEqualTrees(table, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
						props: {},
					},
					{
						id: "row-3",
						cells: {},
						props: {},
					},
				],
			});
		});

		it("Removing by range fails for invalid ranges", () => {
			const row0 = new Row({ id: "row-0", cells: {}, props: {} });
			const row1 = new Row({ id: "row-1", cells: {}, props: {} });
			const table = initializeTree(Table, {
				columns: [],
				rows: [row0, row1],
			});

			assert.throws(
				() => table.removeRows(-1, undefined),
				validateUsageError(
					/Start index out of bounds. Expected index to be on \[0, 1], but got -1/,
				),
			);

			assert.throws(
				() => table.removeRows(1, -1),
				validateUsageError(/Expected non-negative count. Got -1./),
			);

			assert.throws(
				() => table.removeRows(0, 5),
				validateUsageError(
					/End index out of bounds. Expected end to be on \[0, 2], but got 5/,
				),
			);

			// Additionally, no rows should have been removed.
			assert(table.rows.length === 2);
		});
	});

	describeHydration("removeCell", (initializeTree) => {
		it("Remove cell in valid location with existing data", () => {
			const table = initializeTree(Table, {
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
			table.setCell({
				key: cellKey,
				cell: { value: "Hello world!" },
			});
			table.removeCell(cellKey);
			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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
			table.removeCell(cellKey);
			assertEqualTrees(table, {
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
			const table = initializeTree(Table, {
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
					table.removeCell({
						row: "row-1",
						column: "column-0",
					}),
				validateUsageError(/Specified row with ID "row-1" does not exist in the table./),
			);

			// Invalid column
			assert.throws(
				() =>
					table.removeCell({
						row: "row-0",
						column: "column-1",
					}),
				validateUsageError(/Specified column with ID "column-1" does not exist in the table./),
			);
		});
	});

	describeHydration("Responding to changes", (initializeTree, hydrated) => {
		it("Responding to any changes in the table", () => {
			const table = initializeTree(Table, Table.empty());

			let eventCount = 0;

			// Bind listener to the table.
			// The "treeChanged" event will fire when the associated node or any of its descendants change.
			Tree.on(table, "treeChanged", () => {
				eventCount++;
			});

			// Add a row
			table.insertRows({
				rows: [new Row({ id: "row-0", cells: {}, props: {} })],
			});
			assert.equal(eventCount, 1);

			// Add a column
			table.insertColumns({
				columns: [{ id: "column-0", props: {} }],
			});
			assert.equal(eventCount, 2);

			// Set a cell
			table.setCell({
				key: {
					row: "row-0",
					column: "column-0",
				},
				cell: { value: "Hello world!" },
			});
			assert.equal(eventCount, 3);

			// Update cell value
			const cell =
				table.getCell({
					row: "row-0",
					column: "column-0",
				}) ?? fail("Cell not found");
			cell.value = "Updated value!";
			assert.equal(eventCount, 4);
		});

		// Extra events are fired for move operation within unhydrated array nodes.
		// TODO:AB#47457: Fix and re-enable this test in unhydrated mode.
		if (hydrated) {
			it("Responding to column list changes", () => {
				const table = initializeTree(Table, Table.empty());

				let eventCount = 0;

				// Bind listener to the columns list, so we know when a column is added or removed.
				// The "nodeChanged" event will fire only when the specified node itself changes (i.e., its own properties change).
				Tree.on(table.columns, "nodeChanged", () => {
					eventCount++;
				});

				// Add columns
				table.insertColumns({
					columns: [
						{ id: "column-0", props: {} },
						{ id: "column-0", props: {} },
					],
				});
				assert.equal(eventCount, 1);

				// Update column props
				table.columns[0].props = { label: "Column 0" };
				assert.equal(eventCount, 1); // Event should not have fired for column node changes

				// Insert a row
				table.insertRows({ rows: [{ id: "row-0", cells: {}, props: {} }] });
				assert.equal(eventCount, 1); // Event should not have fired for row insertion

				// Re-order columns
				table.columns.moveToEnd(0);
				assert.equal(eventCount, 2);

				// Remove column
				table.removeColumns(["column-0"]);
				assert.equal(eventCount, 3);
			});
		}
	});

	describeHydration("Reading values", (initializeTree) => {
		it("Gets proper table elements with getter methods", () => {
			const cell0 = new Cell({ value: "Hello World!" });
			const column0 = new Column({ id: "column-0", props: {} });
			const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });

			const table = initializeTree(Table, {
				columns: [column0],
				rows: [row0],
			});

			const cell = table.getCell({ column: "column-0", row: "row-0" });
			const column = table.getColumn("column-0");
			const row = table.getRow("row-0");

			assert.equal(cell, cell0);
			assert.equal(row, row0);
			assert.equal(column, column0);
		});
	});

	describe("JSON serialization", () => {
		useSnapshotDirectory("table-schema-json");

		it("schema", () => {
			takeJsonSnapshot(
				getJsonSchema(Table, {
					requireFieldsWithDefaults: false,
					keys: KeyEncodingOptions.usePropertyKeys,
				}) as unknown as JsonCompatibleReadOnly,
			);
		});

		it("data (verbose)", () => {
			const cell0 = new Cell({ value: "Hello World!" });
			const column0 = new Column({ id: "column-0", props: {} });
			const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });
			const table = new Table({
				columns: [column0],
				rows: [row0],
			});

			takeJsonSnapshot(
				TreeAlpha.exportVerbose(table, {}) as unknown as JsonCompatibleReadOnly,
			);
		});

		it("data (concise)", () => {
			const cell0 = new Cell({ value: "Hello World!" });
			const column0 = new Column({ id: "column-0", props: {} });
			const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });
			const table = new Table({
				columns: [column0],
				rows: [row0],
			});

			takeJsonSnapshot(
				TreeAlpha.exportConcise(table, {}) as unknown as JsonCompatibleReadOnly,
			);
		});
	});

	// The code within the following tests is included in TSDoc comments in the source code.
	// If you need to update any of these, please update the corresponding TSDoc comments as well.
	describe("TSDoc comment examples", () => {
		it("TableSchema: Defining a Table schema", () => {
			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = new MyTable({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: { "column-0": "Hello world!" } }],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});

		it("TableSchema: Customizing Column and Row schema", () => {
			class MyColumn extends TableSchema.column({
				schemaFactory,
				cell: Cell,
				props: schemaFactory.object("TableColumnProps", {
					label: schemaFactory.string,
				}),
			}) {}

			class MyRow extends TableSchema.row({
				schemaFactory,
				cell: Cell,
			}) {}

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: Cell,
				column: MyColumn,
				row: MyRow,
			}) {}

			const table = new MyTable({
				columns: [
					new MyColumn({ props: { label: "Entry" } }),
					new MyColumn({ props: { label: "Date" } }),
					new MyColumn({ props: { label: "Amount" } }),
				],
				rows: [],
			});

			// Don't include this line in the example docs.
			allowUnused(table);
		});

		it("TableSchema: Listening for changes in the table", () => {
			// #region Don't include this in the example docs.

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = new MyTable({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});

			// #endregion

			// Listen for any changes to the table and its children.
			// The "treeChanged" event will fire when the associated node or any of its descendants change.
			Tree.on(table, "treeChanged", () => {
				// Respond to the change.
			});
		});

		it("TableSchema: Listening for changes to the rows list only", () => {
			// #region Don't include this in the example docs.

			class MyTable extends TableSchema.table({
				schemaFactory,
				cell: schemaFactory.string,
			}) {}

			const table = new MyTable({
				columns: [{ id: "column-0" }],
				rows: [{ id: "row-0", cells: {} }],
			});

			// #endregion

			// Listen for any changes to the list of rows.
			// The "nodeChanged" event will fire only when the specified node itself changes (i.e., its own properties change).
			// In this case, the event will fire when a row is added or removed, or the order of the list is changed.
			// But it won't fire when a row's properties change, or when the row's cells change, etc.
			Tree.on(table.rows, "nodeChanged", () => {
				// Respond to the change.
			});
		});
	});
});
