/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { testIdCompressor } from "../utils.js";

import {
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
	type TreeView,
} from "../../index.js";

const builder = new SchemaFactory("shared-tree-test");

class ChildNodeSchema extends builder.object("child-item", {
	propertyOne: builder.optional(builder.number),
	propertyTwo: builder.object("propertyTwo-item", {
		itemOne: builder.string,
	}),
	propertyThree: builder.map("propertyThree-map", builder.number),
}) {}

class RootNodeSchema extends builder.object("root-item", {
	child: builder.optional(ChildNodeSchema),
}) {}

function createLocalSharedTree(id: string): TreeView<typeof RootNodeSchema> {
	const sharedTree = SharedTree.create(
		new MockFluidDataStoreRuntime({
			registry: [SharedTree.getFactory()],
			idCompressor: testIdCompressor,
		}),
		id,
	);

	const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));

	view.initialize(
		new RootNodeSchema({
			child: {
				propertyOne: 128,
				propertyTwo: {
					itemOne: "",
				},
				propertyThree: new Map([["numberOne", 1]]),
			},
		}),
	);

	return view;
}

describe("SharedTree memory usage", () => {
	// IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
	// because they won't be out of scope when we garbage-collect between runs of the same test,
	// and that will skew measurements. Tests should allocate all the memory they need using local
	// variables scoped to the test function itself, so several iterations of a given test can
	// measure from the same baseline (as much as possible).

	beforeEach(async () => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	afterEach(() => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			public readonly title = "Create empty SharedTree";

			private sharedTree: TreeView<typeof RootNodeSchema> | undefined;

			public async run(): Promise<void> {
				this.sharedTree = createLocalSharedTree("testSharedTree");
			}
		})(),
	);

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Set an integer property ${x} times in a local SharedTree`;
				private sharedTree: TreeView<typeof RootNodeSchema> =
					createLocalSharedTree("testSharedTree");

				public async run(): Promise<void> {
					assert(this.sharedTree.root.child !== undefined);

					for (let i = 0; i < x; i++) {
						this.sharedTree.root.child.propertyOne = x;
					}
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree("testSharedTree");
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Set a string property ${x} times in a local SharedTree`;
				private sharedTree: TreeView<typeof RootNodeSchema> =
					createLocalSharedTree("testSharedTree");

				public async run(): Promise<void> {
					assert(this.sharedTree.root.child !== undefined);

					for (let i = 0; i < x; i++) {
						this.sharedTree.root.child.propertyTwo.itemOne = i.toString().padStart(6, "0");
					}
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree("testSharedTree");
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title =
					`Set an optional integer property ${x} times in a local SharedTree, then clear it`;
				private sharedTree: TreeView<typeof RootNodeSchema> =
					createLocalSharedTree("testSharedTree");

				public async run(): Promise<void> {
					assert(this.sharedTree.root.child !== undefined);

					for (let i = 0; i < x; i++) {
						this.sharedTree.root.child.propertyOne = x;
					}
					this.sharedTree.root.child.propertyOne = undefined; // This is possible since the property is optional.
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree("testSharedTree");
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.
	}
});
