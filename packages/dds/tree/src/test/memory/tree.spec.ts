/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IMemoryTestObject, benchmarkMemory } from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SchemaFactory, SharedTree, TreeViewConfiguration, type TreeView } from "../../index.js";

/**
 * TODO: Creating `builder` and `RootNodeSchema` in the global scope is a problem for memory-profiling tests.
 * It is preferable to create them in the `createLocalSharedTree` function itself, so that they are out of scope when the test.
 */
const builder = new SchemaFactory("shared-tree-test");

class RootNodeSchema extends builder.object("root-item", {
	propertyOne: builder.optional(builder.number),
	propertyTwo: builder.object("propertyTwo-item", {
		itemOne: builder.boolean,
	}),
}) {}

/**
 * TODO
 */
function createLocalSharedTree(id: string): TreeView<typeof RootNodeSchema> {
    const sharedTree = SharedTree.create(
        new MockFluidDataStoreRuntime({ registry: [SharedTree.getFactory()] }),
        id
    );

    const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));

    view.initialize(
        new RootNodeSchema({
            propertyOne: 128,
            propertyTwo: {
                itemOne: true,
            }
        }),
    );

    return view;
}

function updateSharedTree(sharedTree: TreeView<typeof RootNodeSchema>, x: number): TreeView<typeof RootNodeSchema> {
	sharedTree.initialize(
        new RootNodeSchema({
            propertyOne: x,
            propertyTwo: {
                itemOne: true,
            }
        }),
    );

    return sharedTree;
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
			public readonly minSampleCount = 500;

			private sharedTree: TreeView<typeof RootNodeSchema> | undefined = createLocalSharedTree("testSharedTree");

			public async run(): Promise<void> {
				this.sharedTree = createLocalSharedTree("testSharedTree");
			}
		})(),
	);

	const numbersOfEntriesForTests = [1000, 10_000, 100_000];

	for (const x of numbersOfEntriesForTests) {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Add ${x} integers to a local SharedTree`;
				private sharedTree: TreeView<typeof RootNodeSchema> = createLocalSharedTree("testSharedTree");

				public async run(): Promise<void> {
					for (let i = 0; i < x; i++) {
						this.sharedTree = updateSharedTree(this.sharedTree, i);
						console.log(this.sharedTree.root.propertyOne)
					}
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree("testSharedTree");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Add ${x} integers to a local SharedTree, clear it`;

				public async run(): Promise<void> {
					const localSharedTree = createLocalSharedTree("testSharedTree");
					for (let i = 0; i < x; i++) {
						updateSharedTree(localSharedTree, i);
					}
					// localSharedTree = undefined;
				}

				public beforeIteration(): void {
					// Ensuring each iteration starts with a fresh tree
				}
			})(),
		);

	}
});
