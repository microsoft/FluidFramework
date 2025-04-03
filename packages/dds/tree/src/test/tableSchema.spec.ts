/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ConciseTree,
	type TreeNode,
	type VerboseTree,
} from "../simple-tree/index.js";
import { TreeFactory } from "../treeFactory.js";
import { TableFactory } from "../tableSchema.js";
import { TreeAlpha } from "../shared-tree/index.js";

const treeFactory = new TreeFactory({});

describe.only("table schema", () => {
	function createTableTree() {
		const schemaFactory = new SchemaFactoryAlpha("test");
		class Cell extends schemaFactory.object("table-cell", {
			value: schemaFactory.string,
		}) {}

		class Column extends TableFactory.createColumnSchema(schemaFactory) {}

		class Row extends TableFactory.createRowSchema(schemaFactory, Cell, Column) {}

		class Table extends TableFactory.createTableSchema(schemaFactory, Cell, Column, Row) {}

		// TODO: use `independentView` to avoid needing Fluid goo
		const tree = treeFactory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const treeView = tree.viewWith(
			new TreeViewConfiguration({
				schema: Table,
				enableSchemaValidation: true,
			}),
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

	// Test TODOs:
	// - insert rows
	// - insert columns
	// - insert cells
	// - remove rows
	// - remove columns
	// - remove cells
	// - move rows
	// - move columns

	it("Smoke test", () => {
		const { treeView } = createTableTree();

		treeView.initialize({ rows: [], columns: [] });

		assertEqualTrees(treeView.root, {
			rows: [],
			columns: [],
		});

		treeView.root.insertRows({
			rows: [
				{
					id: "row-0",
					cells: {},
				},
			],
		});
		treeView.root.insertColumn({
			column: {
				id: "column-0",
			},
		});

		assertEqualTrees(treeView.root, {
			rows: [
				{
					id: "row-0",
					cells: {},
				},
			],
			columns: [
				{
					id: "column-0",
				},
			],
		});

		let cell00 = treeView.root.getCell({ rowId: "row-0", columnId: "column-0" });
		assert.equal(cell00, undefined);

		const column0 = treeView.root.getColumn("column-0") ?? fail("Column not found");
		const row0 = treeView.root.getRow("row-0") ?? fail("Row not found");
		row0.setCell(column0, { value: "Hello world!" });

		cell00 = treeView.root.getCell({ rowId: "row-0", columnId: "column-0" });
		assert.equal(cell00?.value, "Hello world!");
	});
});
