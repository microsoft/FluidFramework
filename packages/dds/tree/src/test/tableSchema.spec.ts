/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactoryAlpha, TreeViewConfiguration } from "../simple-tree/index.js";
import { TreeFactory } from "../treeFactory.js";
import { createColumnSchema, createRowSchema, createTableSchema } from "../tableSchema.js";

const treeFactory = new TreeFactory({});

describe.only("table schema", () => {
	it("Smoke test", () => {
		const schemaFactory = new SchemaFactoryAlpha("test");
		class Cell extends schemaFactory.object("table-cell", {
			value: schemaFactory.string,
		}) {}

		class Column extends createColumnSchema(schemaFactory) {}

		class Row extends createRowSchema(schemaFactory, Cell, Column) {}

		class Table extends createTableSchema(schemaFactory, Cell, Column, Row) {}

		// TODO: use `independentView` to avoid needing Fluid goo
		const tree = treeFactory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view = tree.viewWith(
			new TreeViewConfiguration({
				schema: Table,
				enableSchemaValidation: true,
			}),
		);

		// TODO: make initialization easier (shouldn't need to specify rows / columns).
		// In fact, we really probably don't want to let users specify rows / columns.
		view.initialize({
			rows: [],
			columns: [],
		});

		// TODO: export verbose and use that output for comparison

		// TODO: why is `view.root` an empty object?
		assert.deepEqual(view.root, {
			rows: [],
			columns: [],
		});

		view.root.insertRows({
			rows: [
				{
					id: "row-0",
					cells: {},
				},
			],
		});
		view.root.insertColumn({
			column: {
				id: "column-0",
			},
		});

		assert.deepEqual(view.root, {
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

		let cell00: Cell | undefined = view.root.getCell({ rowId: "row-0", columnId: "column-0" });
		assert.equal(cell00, undefined);

		const column0: Column = view.root.getColumn("column-0") ?? fail("Column not found");
		const row0: Row = view.root.getRow("row-0") ?? fail("Row not found");
		row0.setCell(column0, { value: "Hello world!" });

		cell00 = view.root.getCell({ rowId: "row-0", columnId: "column-0" });
		assert.equal(cell00?.value, "Hello world!");
	});
});
