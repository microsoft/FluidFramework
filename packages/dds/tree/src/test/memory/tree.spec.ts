/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { testIdCompressor } from "../utils.js";

import {
	configuredSharedTree,
	ForestTypeOptimized,
	ForestTypeReference,
	SchemaFactory,
	TreeCompressionStrategy,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type SharedTreeOptions,
	type TreeView,
} from "../../index.js";
import type { NodeBuilderData } from "../../internalTypes.js";

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

const initialState = {
	child: {
		propertyOne: 128,
		propertyTwo: {
			itemOne: "",
		},
		propertyThree: { numberOne: 1 },
	},
} satisfies NodeBuilderData<typeof RootNodeSchema>;

/**
 * Polymorphic array schema to make uniform chunking less efficient.
 */
class PolymorphicArray extends builder.array("root-item-with-basic-chunks", [
	builder.number,
	builder.string,
]) {}

/**
 * Monomorphic array schema to make uniform chunking more efficient.
 */
class MonomorphicArray extends builder.array("root-item-with-basic-chunks", builder.number) {}

/**
 * Deep monomorphic node schema to highlight efficiency of chunked forest.
 */
class DeepMonomorphicNode extends builder.object("wrapped-item", {
	layer1: builder.object("nested-1", {
		layer2: builder.object("nested-2", {
			layer3: builder.object("nested-3", {
				layer4: builder.object("nested-4", {
					x: builder.number,
					y: builder.number,
				}),
			}),
		}),
	}),
}) {}

/**
 * Array of Deep monomorphic nodes to emphasize chunked forest's efficiency
 */
class DeepMonomorphicArray extends builder.array(
	"root-item-with-nested-nodes",
	DeepMonomorphicNode,
) {}

function createLocalSharedTree<TSchema extends ImplicitFieldSchema>(
	id: string,
	schema: TSchema,
	content: InsertableTreeFieldFromImplicitField<TSchema>,
	sharedTreeOptions: SharedTreeOptions = {},
): TreeView<TSchema> {
	const sharedTree = configuredSharedTree(sharedTreeOptions);
	const tree = sharedTree.create(
		new MockFluidDataStoreRuntime({
			registry: [sharedTree.getFactory()],
			idCompressor: testIdCompressor,
		}),
		id,
	);

	const view = tree.viewWith(new TreeViewConfiguration({ schema }));

	view.initialize(content);

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
			// Assign to this field so that JS GC does not collect the SharedTree instance.
			private _sharedTree?: TreeView<typeof RootNodeSchema>;

			public async run(): Promise<void> {
				this._sharedTree = createLocalSharedTree(
					"testSharedTree",
					RootNodeSchema,
					new RootNodeSchema(initialState),
				);
			}
		})(),
	);

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const numberOfEntries of numbersOfEntriesForTests) {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title =
					`Set an integer property ${numberOfEntries} times in a local SharedTree`;
				private sharedTree?: TreeView<typeof RootNodeSchema>;

				public async run(): Promise<void> {
					assert(this.sharedTree?.root.child !== undefined);

					for (let i = 0; i < numberOfEntries; i++) {
						this.sharedTree.root.child.propertyOne = numberOfEntries;
					}
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree(
						"testSharedTree",
						RootNodeSchema,
						new RootNodeSchema(initialState),
					);
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title =
					`Set a string property ${numberOfEntries} times in a local SharedTree`;
				private sharedTree?: TreeView<typeof RootNodeSchema>;
				public async run(): Promise<void> {
					assert(this.sharedTree?.root.child !== undefined);

					for (let i = 0; i < numberOfEntries; i++) {
						this.sharedTree.root.child.propertyTwo.itemOne = i.toString().padStart(6, "0");
					}
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree(
						"testSharedTree",
						RootNodeSchema,
						new RootNodeSchema(initialState),
					);
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title =
					`Set an optional integer property ${numberOfEntries} times in a local SharedTree, then clear it`;
				private sharedTree?: TreeView<typeof RootNodeSchema>;

				public async run(): Promise<void> {
					assert(this.sharedTree?.root.child !== undefined);

					for (let i = 0; i < numberOfEntries; i++) {
						this.sharedTree.root.child.propertyOne = numberOfEntries;
					}
					this.sharedTree.root.child.propertyOne = undefined; // This is possible since the property is optional.
				}

				public beforeIteration(): void {
					this.sharedTree = createLocalSharedTree(
						"testSharedTree",
						RootNodeSchema,
						new RootNodeSchema(initialState),
					);
				}
			})(),
		).timeout(40000); // Set relatively higher threshold as 100_000 iterations can take a while.
	}

	/**
	 * Define a suite of benchmarks for testing the memory use of variety of sizes of trees of the given schema in various forest implementations.
	 */
	function describeMemoryBenchmarksForSubtrees<TSchema extends ImplicitFieldSchema>(
		title: string,
		schema: TSchema,
		generateContent: (numberOfNodes: number) => InsertableTreeFieldFromImplicitField<TSchema>,
		testNodeCounts: number[],
	) {
		describe(title, () => {
			for (const numberOfNodes of testNodeCounts) {
				for (const [forestName, forestType] of [
					["ObjectForest", ForestTypeReference],
					["ChunkedForest", ForestTypeOptimized],
				] as const) {
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							public readonly title =
								`initialize ${numberOfNodes} nodes into tree using ${forestName}`;

							private sharedTree: TreeView<typeof schema> | undefined;

							public async run(): Promise<void> {
								this.sharedTree = createLocalSharedTree(
									"testSharedTree",
									schema,
									generateContent(numberOfNodes),
									{
										forest: forestType,
										treeEncodeType: TreeCompressionStrategy.Compressed,
									},
								);
							}

							public beforeIteration(): void {
								this.sharedTree = undefined;
							}
						})(),
					).timeout(400000);
				}
			}
		});
	}

	const numberOfNodesForTests = isInPerformanceTestingMode ? [1, 10, 100, 1000] : [10];
	// TODO: AB#24885 needs .only to describe block when running in performance mode if you need to see the results. Check to see why it does not run without .only.
	describe("Forest memory usage", () => {
		describeMemoryBenchmarksForSubtrees(
			"Array of monomorphic leaves",
			MonomorphicArray,
			(numberOfNodes: number) =>
				new MonomorphicArray(Array.from({ length: numberOfNodes }, (_, index) => index + 1)),
			numberOfNodesForTests,
		);

		describeMemoryBenchmarksForSubtrees(
			"Array of polymorphic leaves",
			PolymorphicArray,
			(numberOfNodes: number) =>
				new PolymorphicArray(Array.from({ length: numberOfNodes }, (_, index) => index + 1)),
			numberOfNodesForTests,
		);

		describeMemoryBenchmarksForSubtrees(
			"Array of deep monomorphic leaves",
			DeepMonomorphicArray,
			(numberOfNodes: number) =>
				new DeepMonomorphicArray(
					Array.from(
						{ length: numberOfNodes },
						(_, index) =>
							new DeepMonomorphicNode({
								layer1: { layer2: { layer3: { layer4: { x: index, y: index + 1 } } } },
							}),
					),
				),
			numberOfNodesForTests,
		);
	});
});
