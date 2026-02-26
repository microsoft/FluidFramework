/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ValueTreeNode } from "../../util/index.js";

// Allow importing from this specific file which is being tested:

describe("ValueTree", () => {
	describe("constructor", () => {
		it("creates a leaf node with no children", () => {
			const tree = new ValueTreeNode("root");
			assert.equal(tree.value, "root");
			assert.deepEqual(tree.children, []);
		});

		it("creates a node with children", () => {
			const child1 = new ValueTreeNode("child1");
			const child2 = new ValueTreeNode("child2");
			const tree = new ValueTreeNode("root", [child1, child2]);
			assert.equal(tree.value, "root");
			assert.equal(tree.children.length, 2);
			assert.equal(tree.children[0], child1);
			assert.equal(tree.children[1], child2);
		});
	});
});
