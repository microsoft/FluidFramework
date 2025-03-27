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
			sf: schemaFactory,
			// TODO: don't require array wrapping
			schemaTypes: [Cell],
			// TODO: make props optional
			columnProps: [ColumnProps],
			rowProps: [schemaFactory.null],
		}) {}

		const tree = treeFactory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view = tree.viewWith(new TreeViewConfiguration({ schema: Table }));

		// TODO: make initialization easier (shouldn't need to specify rows / columns).
		// In fact, we really probably don't want to let users specify rows / columns.
		view.initialize({
			rows: [],
			columns: [],
		});

		// TODO: why is `view.root` an empty object?
		assert.deepEqual(view.root, {
			rows: [],
			columns: [],
		});

		view.root.insertRows({
			rows: [
				{
					_cells: [],
					props: null,
				},
			],
		});
		view.root.insertColumn({
			column: {
				props: {
					name: "column 1",
					typeHint: "string",
				},
			},
		});

		assert.deepEqual(view.root, {
			rows: [
				{
					_cells: [],
					props: null,
				},
			],
			columns: [
				{
					props: {
						name: "column 1",
						typeHint: "string",
					},
				},
			],
		});
	});
});
