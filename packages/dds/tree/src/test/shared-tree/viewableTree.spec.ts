/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import { asAlpha, createIndependentTreeAlpha } from "@fluidframework/tree/alpha";

import {
	createIndependentTreeCheckout,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/independentView.js";
import { exportSimpleSchema, ForestTypeExpensiveDebug } from "../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Allow importing the module being tested
import { createViewableTreeAlpha } from "../../shared-tree/viewableTree.js";
import {
	FieldKind,
	NodeKind,
	SchemaFactory,
	TreeViewConfigurationAlpha,
	type SimpleLeafNodeSchema,
	type SimpleTreeSchema,
	type ViewableTreeAlpha,
} from "../../simple-tree/index.js";
import { testIdCompressor, TestTreeProviderLite } from "../utils.js";
import { ValueSchema } from "../../core/index.js";

describe("viewableTree", () => {
	for (const { name, makeTree } of [
		{
			name: "independent tree",
			makeTree: (): ViewableTreeAlpha => createIndependentTreeAlpha(),
		},
		{
			name: "SharedTree",
			makeTree: (): ViewableTreeAlpha => asAlpha(new TestTreeProviderLite().trees[0]),
		},
	]) {
		describe(`${name}.forkBranch`, () => {
			const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });

			it("forks an uninitialized tree without creating a source view", () => {
				const tree = makeTree();
				const branch = tree.forkBranch();
				try {
					const branchView = branch.viewWith(config);
					branchView.initialize(1);
					const sourceView = tree.viewWith(config);
					assert.equal(sourceView.compatibility.canInitialize, true);
					sourceView.dispose();
					branchView.dispose();
					assert.equal(branch.disposed, false);
				} finally {
					branch.dispose();
				}
			});

			it("creates independent branches and merges changes back into the source", () => {
				const tree = makeTree();
				const sourceView = tree.viewWith(config);
				sourceView.initialize(1);
				const first = tree.forkBranch();
				const second = tree.forkBranch();
				try {
					const firstView = first.viewWith(config);
					const secondView = second.viewWith(config);
					firstView.root = 2;
					assert.equal(sourceView.root, 1);
					assert.equal(secondView.root, 1);

					asAlpha(sourceView).merge(firstView);
					assert.equal(sourceView.root, 2);
					assert.equal(first.disposed, true);
					assert.equal(firstView.disposed, true);
					assert.equal(second.disposed, false);
					assert.equal(secondView.root, 1);
				} finally {
					if (!first.disposed) {
						first.dispose();
					}
					second.dispose();
					sourceView.dispose();
				}
			});

			it("forks initialized content after the source view is disposed", () => {
				const tree = makeTree();
				const sourceView = tree.viewWith(config);
				sourceView.initialize(1);
				sourceView.dispose();
				const branch = tree.forkBranch();
				try {
					const branchView = branch.viewWith(config);
					assert.equal(branchView.root, 1);
					const child = branch.fork();
					try {
						branch.dispose();
						assert.equal(child.disposed, false);
						assert.equal(child.viewWith(config).root, 1);
					} finally {
						child.dispose();
					}
				} finally {
					if (!branch.disposed) {
						branch.dispose();
					}
				}
			});

			it("rejects forking during a source transaction", () => {
				const tree = makeTree();
				const sourceView = asAlpha(tree.viewWith(config));
				sourceView.initialize(1);
				try {
					sourceView.runTransaction(() => {
						assert.throws(() => tree.forkBranch(), validateUsageError(/pending transaction/));
					});
					const branch = tree.forkBranch();
					branch.dispose();
				} finally {
					sourceView.dispose();
				}
			});
		});
	}

	it("createViewableTreeAlpha", () => {
		const checkout = createIndependentTreeCheckout({
			forest: ForestTypeExpensiveDebug,
			idCompressor: testIdCompressor,
		});
		const tree = createViewableTreeAlpha(checkout, () =>
			exportSimpleSchema(checkout.storedSchema),
		);

		// Validate uninitialized state
		assert.equal(tree.exportVerbose(), undefined);
		const emptySchema = tree.exportSimpleSchema();
		assert.deepEqual(emptySchema.definitions, new Map());
		assert.equal(emptySchema.root.kind, FieldKind.Optional);
		assert.deepEqual(emptySchema.root.simpleAllowedTypes, new Map());

		const config = new TreeViewConfigurationAlpha({ schema: SchemaFactory.number });
		const view = tree.viewWith(config);
		assert(view.compatibility.canInitialize);

		// Initialize
		view.initialize(1);

		// Validate initialized state
		assert.equal(view.root, 1);
		assert.equal(tree.exportVerbose(), 1);

		const filledSchema = tree.exportSimpleSchema();
		const expected: SimpleTreeSchema = {
			root: {
				kind: FieldKind.Required,
				simpleAllowedTypes: new Map([
					["com.fluidframework.leaf.number", { isStaged: undefined }],
				]),
				metadata: {},
				persistedMetadata: undefined,
			},
			definitions: new Map([
				[
					"com.fluidframework.leaf.number",
					{
						kind: NodeKind.Leaf,
						leafKind: ValueSchema.Number,
						metadata: {},
						persistedMetadata: undefined,
					} satisfies SimpleLeafNodeSchema,
				],
			]),
		};
		assert.deepEqual(filledSchema, expected);

		view.dispose();
	});
});
