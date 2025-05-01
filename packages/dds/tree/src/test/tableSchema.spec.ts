/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";

import {
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ConciseTree,
	type TreeNode,
} from "../simple-tree/index.js";
import { TableSchema } from "../tableSchema.js";
import { independentView, TreeAlpha } from "../shared-tree/index.js";
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
		class Column extends TableSchema.createColumnInternal(schemaFactory, ColumnProps) {}

		class RowProps extends schemaFactory.object("table-row-props", {
			/**
			 * Whether or not the row is selectable.
			 * @defaultValue `true`
			 */
			selectable: schemaFactory.optional(schemaFactory.boolean),
		}) {}
		class Row extends TableSchema.createRow(
			schemaFactory,
			Cell,
			schemaFactory.optional(RowProps),
		) {}

		class Table extends TableSchema.createTable(schemaFactory, Cell, Column, Row) {}

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
			class Column extends TableSchema.createColumn(schemaFactory) {}
			const column = new Column({ id: "column-0" });
			assert.equal(column.props, undefined);
		});

		it("Can create with props", () => {
			class Column extends TableSchema.createColumn(schemaFactory, schemaFactory.string) {}
			const column = new Column({ id: "column-0", props: "Column 0" });
			assert.equal(column.props, "Column 0");
		});
	});

	describe("Initialization", () => {
		it("Empty", () => {
			const { treeView } = createTableTree();

			treeView.initialize({ rows: [], columns: [] });
			assertEqualTrees(treeView.root, { columns: [], rows: [] });
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

	describe("Insert column", () => {
		it("Insert new column into empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [] });

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

		// TODO: There is currently no policy from prohibiting insertion of a column that already exists.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("Appending existing column errors", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				rows: [],
				columns: [
					{ id: "column-a", props: {} },
					{ id: "column-b", props: {} },
				],
			});

			assert.throws(
				() =>
					treeView.root.insertColumn({
						column: { id: "column-b", props: {} },
					}),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Insert rows", () => {
		it("Insert empty rows list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [] });

			treeView.root.insertRows({ index: 0, rows: [] });

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("Insert single row into empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [] });

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

		// TODO: There is currently no policy from prohibiting insertion of a row that already exists.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("Inserting row that already exists fails", () => {
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

			assert.throws(
				() =>
					treeView.root.insertRows({
						rows: [
							{
								id: "row-a",
								cells: {},
								props: {},
							},
						],
					}),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Set cell", () => {
		it("set cell in a valid location", () => {
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
					rowId: "row-0",
					columnId: "column-0",
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

		// TODO: There is currently no policy from prohibiting insertion of an invalid cell.
		// Once that work is finished, the usage error in this test should be updated, and the test can be un-skipped.
		it.skip("setting cell in an invalid location errors", () => {
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

			assert.throws(
				() =>
					treeView.root.setCell({
						key: {
							rowId: "row-1",
							columnId: "column-1",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Remove column", () => {
		it("remove existing column", () => {
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

			treeView.root.removeColumn(treeView.root.columns[0]);
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

		// TODO: There is currently no policy from prohibiting removal of non-existent columns.
		// Once that work is finished, the usage error in this test should be updated, and the test can be un-skipped.
		it.skip("removing column that does not exist on table errors", () => {
			const { treeView, Column } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.removeColumn(new Column({ id: "unhydrated-column", props: {} })),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Remove rows", () => {
		it("remove empty list", () => {
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

		it("remove single row", () => {
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

		it("remove multiple rows", () => {
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

		it("removing single row that doesn't exist on table errors", () => {
			const { treeView, Row } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.removeRows([new Row({ id: "row-0", cells: {}, props: {} })]),
				validateUsageError(/Expected non-negative index, got -1./),
			);
		});

		it("removing multiple rows that doesn't exist on table errors", () => {
			const { treeView, Row } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() =>
					treeView.root.removeRows([
						new Row({ id: "row-0", cells: {}, props: {} }),
						new Row({ id: "row-1", cells: {}, props: {} }),
					]),
				// TODO: The usage error here comes from the arrayNode layer.
				// Once removeRows gets updated to return a usage error that makes more sense, update usage error here.
				validateUsageError(/Expected non-negative index, got -1./),
			);
		});
	});

	describe("Remove cell", () => {
		it("remove cell in valid location with existing data", () => {
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
				rowId: "row-0",
				columnId: "column-0",
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

		it("remove cell in valid location with no data", () => {
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
				rowId: "row-0",
				columnId: "column-0",
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

		// TODO: There is currently no usage error for deleting invalid cells.
		// Once that work is finished, the usage error in this test should be updated, and the test can be un-skipped.
		it.skip("removing cell from nonexistent row and column errors", () => {
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
			const invalidCellKey = {
				rowId: "invalid-row",
				columnId: "invalid-column",
			};

			assert.throws(
				() => treeView.root.removeCell(invalidCellKey),
				validateUsageError(/Placeholder usage error./),
			);
		});
	});

	it("can read row props", () => {
		const { treeView, Row } = createTableTree();

		const row = new Row({ id: "row-0", cells: {}, props: { selectable: false } });

		treeView.initialize({
			columns: [],
			rows: [row],
		});

		assert.equal(row.props?.selectable, false);
	});

	it("gets proper table elements with getter methods", () => {
		const { treeView, Column, Row, Cell } = createTableTree();

		const cell0 = new Cell({ value: "Hello World!" });
		const column0 = new Column({ id: "column-0", props: {} });
		const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 }, props: {} });

		treeView.initialize({
			columns: [column0],
			rows: [row0],
		});

		const cell = treeView.root.getCell({ columnId: "column-0", rowId: "row-0" });
		const column = treeView.root.getColumn("column-0");
		const row = treeView.root.getRow("row-0");

		assert.equal(cell, cell0);
		assert.equal(row, row0);
		assert.equal(column, column0);
	});
});
