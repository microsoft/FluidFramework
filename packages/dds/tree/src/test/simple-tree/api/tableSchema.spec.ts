/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	createTableSchema,
	SchemaFactory,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import { TreeFactory } from "../../../treeFactory.js";

const treeFactory = new TreeFactory({});

describe.only("table schema", () => {
	it("Smoke test", () => {
		const schemaFactory = new SchemaFactory("test");
		class Cell extends schemaFactory.object("table-cell", {
			value: schemaFactory.string,
		}) {}

		class ColumnProps extends schemaFactory.object("table-column-props", {
			name: schemaFactory.string,
			typeHint: schemaFactory.string,
		}) {}

		class Table extends createTableSchema({
			schemaFactory,
			// TODO: don't require array wrapping
			cellSchema: Cell,
			// TODO: make props optional
			columnProps: [ColumnProps],
			rowProps: [schemaFactory.null],
		}) {}

		// TODO: use `independentView` to avoid needing Fluid goo
		const tree = treeFactory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view = tree.viewWith(
			new TreeViewConfiguration({
				schema: Table,
				enableSchemaValidation: true,
				preventAmbiguity: true,
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
		// assert.deepEqual(view.root, {
		// 	rows: [],
		// 	columns: [],
		// });

		view.root.insertRows({
			rows: [
				{
					id: "row-0",
					cells: {},
					props: null,
				},
			],
		});
		view.root.insertColumn({
			column: {
				id: "column-0",
				props: {
					name: "Description",
					typeHint: "string",
				},
			},
		});

		assert.deepEqual(view.root, {
			rows: [
				{
					id: "row-0",
					cells: {},
					props: null,
				},
			],
			columns: [
				{
					id: "column-0",
					props: {
						name: "Description",
						typeHint: "string",
					},
				},
			],
		});
	});
});
