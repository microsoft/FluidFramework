/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	independentInitializedView,
	independentInitializedViewInternal,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/independentView.js";
import {
	extractPersistedSchema,
	SchemaFactory,
	toStoredSchema,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
import { ForestTypeExpensiveDebug, TreeAlpha } from "../../shared-tree/index.js";
import { ajvValidator } from "../codec/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { fieldCursorFromInsertable, testIdCompressor } from "../utils.js";

describe("independentView", () => {
	describe("independentInitializedView", () => {
		// Regression test for debug forest erroring during initialization due to being out of schema.
		it("debug forest", () => {
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const view = independentInitializedView(
				config,
				{
					forest: ForestTypeExpensiveDebug,
					jsonValidator: ajvValidator,
				},
				{
					schema: extractPersistedSchema(config, FluidClientVersion.v2_0),
					tree: TreeAlpha.exportCompressed(1, {
						oldestCompatibleClient: FluidClientVersion.v2_0,
					}),
					idCompressor: testIdCompressor,
				},
			);
			assert.equal(view.root, 1);
		});
	});

	describe("independentInitializedViewInternal", () => {
		// Regression test for debug forest erroring during initialization due to being out of schema.
		it("debug forest", () => {
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
			const view = independentInitializedViewInternal(
				config,
				{
					forest: ForestTypeExpensiveDebug,
					jsonValidator: ajvValidator,
				},
				toStoredSchema(config.schema),
				fieldCursorFromInsertable(config.schema, 1),
				testIdCompressor,
			);
			assert.equal(view.root, 1);
		});
	});
});
