/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { deepCopyMapTree, type ExclusiveMapTree } from "../../../core/index.js";
import { brand } from "../../../util/index.js";

describe("mapTree", () => {
	// Used by `generateMapTree` to give unique types and values to each MapTree
	let mapTreeGeneration = 0;
	function generateMapTree(depth: number): ExclusiveMapTree {
		const generation = mapTreeGeneration++;
		return {
			type: brand(String(generation)),
			value: generation,
			fields: new Map(
				depth === 0
					? []
					: [
							[brand("a"), [generateMapTree(depth - 1), generateMapTree(depth - 1)]],
							[brand("b"), [generateMapTree(depth - 1), generateMapTree(depth - 1)]],
						],
			),
		};
	}

	it("empty tree", () => {
		const mapTree = generateMapTree(0);
		assert.deepEqual(deepCopyMapTree(mapTree), mapTree);
	});

	it("shallow tree", () => {
		const mapTree = generateMapTree(1);
		assert.deepEqual(deepCopyMapTree(mapTree), mapTree);
	});

	it("deep tree", () => {
		const mapTree = generateMapTree(2);
		assert.deepEqual(deepCopyMapTree(mapTree), mapTree);
	});
});
