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
	configuredSharedTree,
	ForestType,
	SchemaFactory,
	SharedTree,
	TreeCompressionStrategy,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type SharedTreeOptions,
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

const initialState = {
	child: {
		propertyOne: 128,
		propertyTwo: {
			itemOne: "",
		},
		propertyThree: new Map([["numberOne", 1]]),
	},
};

// Array has 2 allowable types to make it less efficient for uniform chunks.
class RootNodeSchemaBasicChunks extends builder.array("root-item-with-basic-chunks", [
	builder.number,
	builder.string,
]) {}

class RootNodeSchemaUniform extends builder.array(
	"root-item-with-basic-chunks",
	builder.number,
) {}

class NestedNodeSchema extends builder.object("wrapped-item", {
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

// Array with nodes which are nested
class RootNodeSchemaWithNestedNodes extends builder.array(
	"root-item-with-nested-nodes",
	NestedNodeSchema,
) {}

function createLocalSharedTree<TSchema extends ImplicitFieldSchema>(
	id: string,
	schema: TSchema,
	content: InsertableTreeFieldFromImplicitField<TSchema>,
	sharedTreeOptions?: SharedTreeOptions,
): TreeView<TSchema> {
	const sharedTree =
		sharedTreeOptions !== undefined ? configuredSharedTree(sharedTreeOptions) : SharedTree;
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

	const numberOfNodesForTests = isInPerformanceTestingMode ? [1000, 10_000, 50_000] : [10];
	describe("Chunked Forest memory usage", () => {
		for (const numberOfNodes of numberOfNodesForTests) {
			for (const forestType of [ForestType.Reference, ForestType.Optimized]) {
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title =
							`initialize ${numberOfNodes} nodes into tree with schema that is inefficient for chunked forest using ${forestType === 0 ? "ObjectForest" : "ChunkedForest"}`;

						private sharedTree: TreeView<typeof RootNodeSchemaBasicChunks> | undefined;

						public async run(): Promise<void> {
							this.sharedTree = createLocalSharedTree(
								"testSharedTree",
								RootNodeSchemaBasicChunks,
								new RootNodeSchemaBasicChunks(
									Array.from({ length: numberOfNodes }, (_, index) => index + 1),
								),
								{ forest: forestType },
							);
						}

						public beforeIteration(): void {
							this.sharedTree = undefined;
						}
					})(),
				).timeout(40000);

				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title =
							`initialize ${numberOfNodes} nodes into tree with schema that is efficient for chunked forest using ${forestType === 0 ? "ObjectForest" : "ChunkedForest"}`;

						private sharedTree: TreeView<typeof RootNodeSchemaUniform> | undefined;

						public async run(): Promise<void> {
							this.sharedTree = createLocalSharedTree(
								"testSharedTree",
								RootNodeSchemaUniform,
								new RootNodeSchemaUniform(
									Array.from({ length: numberOfNodes }, (_, index) => index + 1),
								),
								{ forest: forestType, treeEncodeType: TreeCompressionStrategy.Compressed },
							);
						}

						public beforeIteration(): void {
							this.sharedTree = undefined;
						}
					})(),
				).timeout(400000);

				benchmarkMemory(
					new (class implements IMemoryTestObject {
						public readonly title =
							`initialize ${numberOfNodes} nested nodes into tree with schema that is efficient for chunked forest using ${forestType === 0 ? "ObjectForest" : "ChunkedForest"}`;

						private sharedTree: TreeView<typeof RootNodeSchemaWithNestedNodes> | undefined;

						public async run(): Promise<void> {
							this.sharedTree = createLocalSharedTree(
								"testSharedTree",
								RootNodeSchemaWithNestedNodes,
								new RootNodeSchemaWithNestedNodes(
									Array.from(
										{ length: numberOfNodes },
										(_, index) =>
											new NestedNodeSchema({
												layer1: { layer2: { layer3: { layer4: { x: index, y: index + 1 } } } },
											}),
									),
								),
								{ forest: forestType, treeEncodeType: TreeCompressionStrategy.Compressed },
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
});
