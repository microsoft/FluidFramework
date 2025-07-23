/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
// eslint-disable-next-line import/no-internal-modules
import { independentInitializedView } from "../../shared-tree/independentView.js";
import {
	extractPersistedSchema,
	SchemaFactory,
	TreeViewConfigurationAlpha,
} from "../../simple-tree/index.js";
import { ForestTypeExpensiveDebug } from "../../shared-tree/index.js";
import { ajvValidator } from "../codec/index.js";
import { FluidClientVersion } from "../../codec/index.js";
import { testIdCompressor } from "../utils.js";

describe("independentView", () => {
	describe("independentInitializedView", () => {
		// Repression test for debug forest erroring during initialization due to being out of schema.
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
					tree: { type: "number", value: 1 },
					idCompressor: testIdCompressor,
				},
			);
			assert.equal(view.root, 1);
		});
	});
});
