/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { emptyStringSequenceConfig, flexTreeViewWithContent } from "../utils";

describe("sharedTreeView", () => {
	it("reads only one node", () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const view = flexTreeViewWithContent(emptyStringSequenceConfig);
		view.editableTree.insertAtStart("x");
		assert.deepEqual(view.editableTree.asArray, ["x"]);
	});
});
