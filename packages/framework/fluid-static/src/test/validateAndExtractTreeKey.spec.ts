/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SharedMap } from "@fluidframework/map/internal";
import { SharedTree } from "@fluidframework/tree/internal";

import { validateAndExtractTreeKey } from "../treeRootDataObject.js";

describe("validateAndExtractTreeKey", () => {
	it("should extract the tree key when schema is valid", () => {
		const schema = {
			initialObjects: {
				tree: SharedTree,
			},
		};

		const result = validateAndExtractTreeKey(schema);
		assert.strictEqual(result, "tree", "Tree key should be extracted correctly");
	});

	it("should throw an error if schema has no initial objects", () => {
		const schema = { initialObjects: {} };

		assert.throws(
			() => validateAndExtractTreeKey(schema),
			/Container schema must have exactly one initial object for tree-based data object./,
			"Error should be thrown for empty initial objects",
		);
	});

	it("should throw an error if schema has multiple initial objects", () => {
		const schema = {
			initialObjects: {
				key1: SharedTree,
				key2: SharedTree,
			},
		};

		assert.throws(
			() => validateAndExtractTreeKey(schema),
			/Container schema must have exactly one initial object for tree-based data object./,
			"Error should be thrown for multiple initial objects",
		);
	});

	it("should throw an error if initial object is not of type SharedTree", () => {
		const schema = {
			initialObjects: {
				tree: SharedMap,
			},
		};

		assert.throws(
			() => validateAndExtractTreeKey(schema),
			/Container schema must have a single initial object of type SharedTree for tree-based data object./,
			"Error should be thrown for invalid SharedTree type",
		);
	});
});
