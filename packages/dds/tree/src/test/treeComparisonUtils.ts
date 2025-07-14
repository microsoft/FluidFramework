/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import type { TreeLeafValue, TreeNode } from "../simple-tree/index.js";
import { Tree, TreeAlpha } from "../shared-tree/index.js";

/**
 * Compares two trees for equality.
 * @param a - The first tree to compare.
 * @param b - The second tree to compare.
 * @remarks This function checks that both trees have the same schema and structure, and that their content is equal.
 */
export function expectTreesEqual(
	a: TreeNode | TreeLeafValue | undefined,
	b: TreeNode | TreeLeafValue | undefined,
): void {
	if (a === undefined || b === undefined) {
		assert.equal(a === undefined, b === undefined);
		return;
	}

	// Validate the same schema objects are used.
	assert.equal(Tree.schema(a), Tree.schema(b));

	// This should catch all cases, assuming exportVerbose works correctly.
	assert.deepEqual(TreeAlpha.exportVerbose(a), TreeAlpha.exportVerbose(b));

	// Since this uses some of the tools to compare trees that this is testing for, perform the comparison in a few ways to reduce risk of a bug making this pass when it shouldn't:
	// This case could have false negatives (two trees with ambiguous schema could export the same concise tree),
	// but should have no false positives since equal trees always have the same concise tree.
	assert.deepEqual(TreeAlpha.exportConcise(a), TreeAlpha.exportConcise(b));
}
