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

		class Column extends TableSchema.createColumn(schemaFactory) {}

		class Row extends TableSchema.createRow(schemaFactory, Cell, Column) {}

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

	describe("Initialization", () => {
		it("Empty", () => {
			const { treeView } = createTableTree();

			treeView.initialize({ rows: [], columns: [] });
			assertEqualTrees(treeView.root, { columns: [], rows: [] });
		});

		it("Non-empty", () => {
			const { treeView } = createTableTree();

			treeView.initialize({
				columns: [{ id: "column-0" }, { id: "column-1" }],
				rows: [
					{ id: "row-0", cells: {} },
					{
						id: "row-1",
						cells: {
							"column-1": { value: "Hello world!" },
						},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
					},
					{
						id: "column-1",
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

			treeView.root.insertColumn({ index: 0, column: { id: "column-0" } });

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [],
			});
		});

		it("Insert new column into non-empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [{ id: "column-a" }, { id: "column-b" }] });

			treeView.root.insertColumn({ index: 1, column: { id: "column-c" } });

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
					},
					{
						id: "column-c",
					},
					{
						id: "column-b",
					},
				],
				rows: [],
			});
		});

		it("Append new column", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [{ id: "column-a" }, { id: "column-b" }] });

			// By not specifying an index, the column should be appended to the end of the list.
			treeView.root.insertColumn({ column: { id: "column-c" } });

			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-a",
					},
					{
						id: "column-b",
					},
					{
						id: "column-c",
					},
				],
				rows: [],
			});
		});

		// TODO: There is currently no policy from prohibiting insertion of a column that already exists.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("Appending existing column fails.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({ rows: [], columns: [{ id: "column-a" }, { id: "column-b" }] });

			assert.throws(
				() => treeView.root.insertColumn({ column: { id: "column-b" } }),
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
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
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
					},
					{
						id: "row-b",
						cells: {},
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
					},
					{
						id: "row-d",
						cells: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
					},
					{
						id: "row-c",
						cells: {},
					},
					{
						id: "row-d",
						cells: {},
					},
					{
						id: "row-b",
						cells: {},
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
					},
					{
						id: "row-b",
						cells: {},
					},
				],
				columns: [],
			});

			treeView.root.insertRows({
				rows: [
					{
						id: "row-c",
						cells: {},
					},
					{
						id: "row-d",
						cells: {},
					},
				],
			});

			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-a",
						cells: {},
					},
					{
						id: "row-b",
						cells: {},
					},
					{
						id: "row-c",
						cells: {},
					},
					{
						id: "row-d",
						cells: {},
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
					},
					{
						id: "row-b",
						cells: {},
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
							},
						],
					}),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Set cell", () => {
		it("Append rows", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
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
					},
				],
			});
		});

		// TODO: There is currently no policy from prohibiting insertion of a cell that already exists.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("inserting cell that already exists fails.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});

			treeView.root.setCell({
				key: {
					rowId: "row-0",
					columnId: "column-0",
				},
				cell: { value: "Hello world!" },
			});

			// Insert the same cell again.
			assert.throws(
				() =>
					treeView.root.setCell({
						key: {
							rowId: "row-0",
							columnId: "column-0",
						},
						cell: { value: "Hello world!" },
					}),
				validateUsageError(/Placeholder usage error/),
			);
		});

		// TODO: There is currently no policy from prohibiting insertion of an invalid cell.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("inserting invalid cell fails.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
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
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
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
					},
				],
			});
		});

		// TODO: There is currently no policy from prohibiting removal of non-existant columns.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("removing column that does not exist on table fails", () => {
			const { treeView, Column } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.removeColumn(new Column({ id: "unhydrated-column" })),
				validateUsageError(/Placeholder usage error/),
			);
		});
	});

	describe("Delete rows", () => {
		it("delete empty list", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			treeView.root.deleteAllRows();
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("delete single row", () => {
			const { treeView, Row } = createTableTree();
			const row0 = new Row({ id: "row-0", cells: {} });
			const row1 = new Row({ id: "row-1", cells: {} });
			treeView.initialize({
				columns: [],
				rows: [row0, row1],
			});

			// Delete row0
			treeView.root.deleteRows([row0]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [{ id: "row-1", cells: {} }],
			});

			// Delete row1
			treeView.root.deleteRows([row1]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("delete multiple rows", () => {
			const { treeView, Row } = createTableTree();
			const row0 = new Row({ id: "row-0", cells: {} });
			const row1 = new Row({ id: "row-1", cells: {} });
			const row2 = new Row({ id: "row-2", cells: {} });
			const row3 = new Row({ id: "row-3", cells: {} });
			treeView.initialize({
				columns: [],
				rows: [row0, row1, row2, row3],
			});

			// Delete rows 1 and 3
			treeView.root.deleteRows([row1, row3]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
					{
						id: "row-2",
						cells: {},
					},
				],
			});

			// Delete rows 0 and 3
			treeView.root.deleteRows([row0, row2]);
			assertEqualTrees(treeView.root, {
				columns: [],
				rows: [],
			});
		});

		it("deleting single row that doesn't exist on table fails", () => {
			const { treeView, Row } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() => treeView.root.deleteRows([new Row({ id: "row-0", cells: {} })]),
				validateUsageError(/Expected non-negative index, got -1./),
			);
		});

		it("deleting multiple rows that doesn't exist on table fails", () => {
			const { treeView, Row } = createTableTree();
			treeView.initialize({
				columns: [],
				rows: [],
			});

			assert.throws(
				() =>
					treeView.root.deleteRows([
						new Row({ id: "row-0", cells: {} }),
						new Row({ id: "row-1", cells: {} }),
					]),
				validateUsageError(/Expected non-negative index, got -1./),
			);
		});
	});

	describe("Delete cell", () => {
		it("delete valid cell with existing data.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
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
			treeView.root.deleteCell(cellKey);
			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});
		});

		it("delete valid cell with no data.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});
			const cellKey = {
				rowId: "row-0",
				columnId: "column-0",
			};
			treeView.root.deleteCell(cellKey);
			assertEqualTrees(treeView.root, {
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});
		});

		// TODO: There is currently no usage error for deleting invalid cells.
		// Once that work is finished, the usage error in this test should be updated, and the test can be unskipped.
		it.skip("deleting invalid cell fails.", () => {
			const { treeView } = createTableTree();
			treeView.initialize({
				columns: [
					{
						id: "column-0",
					},
				],
				rows: [
					{
						id: "row-0",
						cells: {},
					},
				],
			});
			const invalidCellKey = {
				rowId: "invalid-row",
				columnId: "invalid-column",
			};

			assert.throws(
				() => treeView.root.deleteCell(invalidCellKey),
				validateUsageError(/Placeholder usage error./),
			);
		});
	});

	it("gets proper table elements with getter methods.", () => {
		const { treeView, Column, Row, Cell } = createTableTree();

		const cell0 = new Cell({ value: "Hello World!" });
		const column0 = new Column({ id: "column-0" });
		const row0 = new Row({ id: "row-0", cells: { "column-0": cell0 } });

		treeView.initialize({
			columns: [
				column0,
			],
			rows: [
				row0,
			],
		});

		const cell = treeView.root.getCell({ columnId: "column-0", rowId: "row-0" });
		const column = treeView.root.getColumn("column-0");
		const row = treeView.root.getRow("row-0");

		assert.equal(cell, cell0);
		assert.equal(row, row0);
		assert.equal(column, column0);
	});
});
