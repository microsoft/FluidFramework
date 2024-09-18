/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	TreeViewConfiguration,
	SharedTree,
} from "@fluidframework/tree/internal";

import { branch, merge } from "../../branching/index.js";

class MockSharedTreeRuntime extends MockFluidDataStoreRuntime {
	public constructor() {
		super({
			idCompressor: createIdCompressor(),
			registry: [SharedTree.getFactory()],
		});
	}
}

describe.only("branching", () => {
	it("correct behavior", () => {
		const sb = new SchemaFactory("test");
		class TestNode extends sb.object("root", {
			prop1: sb.optional(sb.number),
			prop2: sb.optional(sb.number),
			prop3: sb.optional(sb.number),
		}) {}

		const sharedTree = SharedTree.create(new MockSharedTreeRuntime());

		const originalView = sharedTree.viewWith(new TreeViewConfiguration({ schema: TestNode }));
		originalView.initialize({ prop1: 1, prop2: 2 });

		const forkedView = branch(originalView);

		// The implementation details of the kinds of changes that can happen inside the tree are not exposed at this layer.
		// But since we know them, try to cover all of them.
		forkedView.root.prop1 = 2; // Replace
		forkedView.root.prop2 = undefined; // Detach
		forkedView.root.prop3 = 3; // Attach

		// Validate that before we merge, the forked view shows the changes but the original view doesn't
		// Note: to compare tree nodes we have to compare against instances of the schema class, not just POJOs
		assert.deepEqual(originalView.root, new TestNode({ prop1: 1, prop2: 2 }));
		assert.deepEqual(forkedView.root, new TestNode({ prop1: 2, prop3: 3 }));

		// Merge and validate that the original view now shows the changes
		merge(forkedView, originalView);
		assert.deepEqual(originalView.root, new TestNode({ prop1: 2, prop3: 3 }));
	});
});
