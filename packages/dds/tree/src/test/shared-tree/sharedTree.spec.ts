/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import {
	type ITestFluidObject,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	CommitKind,
	type Revertible,
	type UpPath,
	compareUpPaths,
	moveToDetachedField,
	rootFieldKey,
	storedEmptyFieldSchema,
	type ChangeFamily,
	type ChangeFamilyEditor,
	EmptyKey,
} from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import {
	ChunkedForest,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	MockNodeKeyManager,
	TreeCompressionStrategy,
	TreeStatus,
	cursorForJsonableTreeNode,
} from "../../feature-libraries/index.js";
import {
	ObjectForest,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/object-forest/objectForest.js";
import {
	ForestTypeExpensiveDebug,
	ForestTypeOptimized,
	ForestTypeReference,
	getBranch,
	type ITreePrivate,
	type SharedTree,
	Tree,
	type TreeCheckout,
} from "../../shared-tree/index.js";
import {
	SchematizingSimpleTreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizingTreeView.js";
import type { EditManager } from "../../shared-tree-core/index.js";
import {
	cursorFromInsertable,
	getSimpleSchema,
	SchemaFactory,
	toStoredSchema,
	type TreeFieldFromImplicitField,
	type TreeViewAlpha,
	TreeViewConfiguration,
} from "../../simple-tree/index.js";
import { brand, fail } from "../../util/index.js";
import {
	type ConnectionSetter,
	type ITestTreeProvider,
	SharedTreeTestFactory,
	type SharedTreeWithConnectionStateSetter,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	expectSchemaEqual,
	treeTestFactory,
	validateTreeConsistency,
	validateTreeContent,
	validateUsageError,
	StringArray,
	NumberArray,
	validateViewConsistency,
} from "../utils.js";
import { configuredSharedTree, TreeFactory } from "../../treeFactory.js";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";
import { TestAnchor } from "../testAnchor.js";
// eslint-disable-next-line import/no-internal-modules
import { handleSchema, numberSchema, stringSchema } from "../../simple-tree/leafNodeSchema.js";
import { JsonArray, singleJsonCursor } from "../json/index.js";
import { AttachState } from "@fluidframework/container-definitions";

const enableSchemaValidation = true;

const DebugSharedTree = configuredSharedTree({
	jsonValidator: typeboxValidator,
	forest: ForestTypeReference,
}) as ISharedObjectKind<unknown> as ISharedObjectKind<SharedTree>;

class MockSharedTreeRuntime extends MockFluidDataStoreRuntime {
	public constructor() {
		super({
			idCompressor: createIdCompressor(),
			registry: [DebugSharedTree.getFactory()],
		});
	}
}

describe("SharedTree", () => {
	describe("viewWith", () => {
		it("initialize tree", () => {
			const tree = treeTestFactory();
			assert.deepEqual(tree.contentSnapshot().schema.rootFieldSchema, storedEmptyFieldSchema);

			const config = new TreeViewConfiguration({
				schema: numberSchema,
			});
			const view = tree.viewWith(config);
			view.initialize(10);
			assert.equal(view.root, 10);
		});

		it("concurrent initialize", () => {
			const provider = new TestTreeProviderLite(2);
			const config = new TreeViewConfiguration({
				schema: stringSchema,
			});
			const view1 = provider.trees[0].viewWith(config);
			const view2 = provider.trees[1].viewWith(config);
			view1.initialize("x");
			view2.initialize("x");

			provider.processMessages();
			assert.equal(view1.root, "x");
		});

		it("noop upgrade", () => {
			const tree = DebugSharedTree.create(new MockSharedTreeRuntime());

			const config = new TreeViewConfiguration({
				schema: numberSchema,
			});
			const view1 = tree.viewWith(config);
			view1.initialize(0);
			// Noop upgrade
			view1.upgradeSchema();
			view1.dispose();

			const view2 = tree.viewWith(config);
			// Noop upgrade on separate view.
			view2.upgradeSchema();
		});

		it("unhydrated tree input", () => {
			const tree = DebugSharedTree.create(new MockSharedTreeRuntime());
			const sb = new SchemaFactory("test-factory");
			class Foo extends sb.object("Foo", {}) {}

			const view = tree.viewWith(new TreeViewConfiguration({ schema: Foo }));
			const unhydratedInitialTree = new Foo({});
			view.initialize(unhydratedInitialTree);

			assert(view.root === unhydratedInitialTree);
		});
	});

	it("handle in op", async () => {
		// TODO: ADO#7111 schema should be specified to enable compressed encoding.
		const provider = await TestTreeProvider.create(
			2,
			SummarizeType.disabled,
			new TreeFactory({
				jsonValidator: typeboxValidator,
				treeEncodeType: TreeCompressionStrategy.Uncompressed,
			}),
		);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const field = provider.trees[0].kernel.getEditor().optionalField({
			parent: undefined,
			field: rootFieldKey,
		});
		field.set(
			cursorForJsonableTreeNode({
				type: brand(handleSchema.identifier),
				value: provider.trees[0].handle,
			}),
			true,
		);
	});

	it("end-to-end", () => {
		const sharedTree = treeTestFactory();
		const view = sharedTree.viewWith(
			new TreeViewConfiguration({
				schema: SchemaFactory.number,
				enableSchemaValidation,
			}),
		);
		view.initialize(1);
		assert.equal(view.root, 1);
		view.root = 2;
		assert.equal(view.root, 2);
	});

	it("contentSnapshot", () => {
		const sharedTree = treeTestFactory();
		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, []);
			expectSchemaEqual(snapshot.schema, {
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
		}

		sharedTree
			.viewWith(new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }))
			.initialize(["x"]);

		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, [
				{
					type: `com.fluidframework.json.array`,
					fields: {
						[EmptyKey]: [{ type: "com.fluidframework.leaf.string", value: "x" }],
					},
				},
			]);
			expectSchemaEqual(snapshot.schema, toStoredSchema(StringArray));
		}
	});

	it("can be connected to another tree", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const value = "42";

		// Apply an edit to the first tree which inserts a node with a value
		const view = provider.trees[0].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view.initialize([value]);

		// Ensure that the first tree has the state we expect
		assert.deepEqual([...view.root], [value]);
		expectSchemaEqual(provider.trees[0].kernel.storedSchema, toStoredSchema(StringArray));
		// Ensure that the second tree receives the expected state from the first tree
		await provider.ensureSynchronized();
		validateTreeConsistency(provider.trees[0], provider.trees[1]);
		// Ensure that a tree which connects after the edit has already happened also catches up
		const joinedLaterTree = await provider.createTree();
		validateTreeConsistency(provider.trees[0], joinedLaterTree);
	});

	it("can summarize and load", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const value = 42;
		provider.trees[0]
			.viewWith(
				new TreeViewConfiguration({ schema: JsonArray, enableSchemaValidation: false }),
			)
			.initialize(new JsonArray([value]));

		await provider.summarize();
		await provider.ensureSynchronized();
		const loadingTree = await provider.createTree();
		validateTreeContent(loadingTree.kernel.checkout, {
			schema: JsonArray,
			initialTree: singleJsonCursor([value]),
		});
	});

	async function validateSchemaStringType(
		provider: ITestTreeProvider,
		treeId: string,
		summaryType: SummaryType,
	) {
		const a = (await provider.containers[0].getEntryPoint()) as ITestFluidObject;
		const id = a.runtime.id;

		const { summaryTree } = await provider.summarize();

		assert(
			summaryTree.tree[".channels"].type === SummaryType.Tree,
			"Runtime summary tree not created for blob dds test",
		);
		const dataObjectTree = summaryTree.tree[".channels"].tree[id];
		assert(
			dataObjectTree.type === SummaryType.Tree,
			"Data store summary tree not created for blob dds test",
		);
		const dataObjectChannelsTree = dataObjectTree.tree[".channels"];
		assert(
			dataObjectChannelsTree.type === SummaryType.Tree,
			"Data store channels tree not created for blob dds test",
		);
		const ddsTree = dataObjectChannelsTree.tree[treeId];
		assert(ddsTree.type === SummaryType.Tree, "Blob dds tree not created");
		const indexes = ddsTree.tree.indexes;
		assert(indexes.type === SummaryType.Tree, "Blob Indexes tree not created");
		const schema = indexes.tree.Schema;
		assert(schema.type === SummaryType.Tree, "Blob Schema tree not created");
		assert(schema.tree.SchemaString.type === summaryType, "incorrect SchemaString type");
	}

	describe("schema index summarization", () => {
		describe("incrementally reuses previous blobs", () => {
			it("on a client which never uploaded a blob", async () => {
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
					idCompressor: createIdCompressor(),
				});
				const dataStoreRuntime2 = new MockFluidDataStoreRuntime({
					idCompressor: createIdCompressor(),
				});
				const factory = new SharedTreeTestFactory(() => {});

				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const tree1 = factory.create(dataStoreRuntime1, "A");
				tree1.connect({
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(),
				});

				const sf = new SchemaFactory("test");
				const node = sf.objectRecursive("test node", {
					child: sf.optionalRecursive([() => node, sf.number]),
				});

				const view = tree1.viewWith(
					new TreeViewConfiguration({
						schema: sf.optional(node),
						enableSchemaValidation,
					}),
				);
				view.initialize(undefined);

				view.root = new node({ child: undefined });
				containerRuntimeFactory.processAllMessages();

				const tree2 = await factory.load(
					dataStoreRuntime2,
					"B",
					{
						deltaConnection: dataStoreRuntime2.createDeltaConnection(),
						objectStorage: MockStorage.createFromSummary((await tree1.summarize()).summary),
					},
					factory.attributes,
				);

				containerRuntimeFactory.processAllMessages();
				const incrementalSummaryContext = {
					summarySequenceNumber: dataStoreRuntime1.deltaManagerInternal.lastSequenceNumber,

					latestSummarySequenceNumber:
						dataStoreRuntime1.deltaManagerInternal.lastSequenceNumber,

					summaryPath: "test",
				};
				const summaryTree = await tree2.summarize(
					undefined,
					undefined,
					undefined,
					incrementalSummaryContext,
				);
				containerRuntimeFactory.processAllMessages();
				const indexes = summaryTree.summary.tree.indexes;
				assert(indexes.type === SummaryType.Tree, "Indexes must be a tree");
				const schemaBlob = indexes.tree.Schema;
				assert(schemaBlob.type === SummaryType.Tree, "Blob Schema tree not created");
				assert(
					schemaBlob.tree.SchemaString.type === SummaryType.Handle,
					"schemaString should be a handle",
				);
			});

			it("on a client which uploaded a blob", async () => {
				const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
				await provider.ensureSynchronized();
				const tree = provider.trees[0];
				const view = tree.viewWith(
					new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
				);
				view.initialize([]);
				await provider.ensureSynchronized();
				await provider.summarize();
				view.root.insertAt(0, "A");
				await provider.ensureSynchronized();
				await validateSchemaStringType(provider, provider.trees[0].id, SummaryType.Handle);
			});
		});

		describe("uploads new schema data", () => {
			it("without incremental summary context", async () => {
				const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
				await provider.ensureSynchronized();
				const summaryTree = await provider.trees[0].summarize();
				const indexes = summaryTree.summary.tree.indexes;
				assert(indexes.type === SummaryType.Tree, "Indexes must be a tree");
				const schemaBlob = indexes.tree.Schema;
				assert(schemaBlob.type === SummaryType.Tree, "Blob Schema tree not created");
				assert(
					schemaBlob.tree.SchemaString.type === SummaryType.Blob,
					"schemaString should be a Blob",
				);
			});

			it("when it has changed since the last summary", async () => {
				const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
				await provider.ensureSynchronized();
				const tree = provider.trees[0];
				const view = tree.viewWith(
					new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
				);
				view.initialize([]);
				await provider.ensureSynchronized();
				await provider.summarize();
				view.root.insertAtStart("A");
				await provider.ensureSynchronized();
				await validateSchemaStringType(provider, provider.trees[0].id, SummaryType.Handle);
				view.dispose();
				const view2 = tree.viewWith(
					new TreeViewConfiguration({ schema: JsonArray, enableSchemaValidation }),
				);
				view2.upgradeSchema();
				await provider.ensureSynchronized();
				await validateSchemaStringType(provider, provider.trees[0].id, SummaryType.Blob);
			});
		});
	});

	it("can process ops after loading from summary", async () => {
		const provider = await TestTreeProvider.create(3, SummarizeType.onDemand);
		const [container1, container2, container3] = provider.containers;
		const [tree1, tree2, tree3] = provider.trees;

		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		view1.initialize(["Z", "A", "C"]);
		await provider.ensureSynchronized();

		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		const view3 = tree3.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);

		// Stop the processing of incoming changes on tree3 so that it does not learn about the deletion of Z
		await provider.opProcessingController.pauseProcessing(container3);

		// Remove Z
		view2.root.removeAt(0);

		// Ensure tree2 has a chance to send deletion of Z
		await provider.opProcessingController.processOutgoing(container2);

		// Ensure tree1 has a chance to receive the deletion of Z before putting out a summary
		await provider.opProcessingController.processIncoming(container1);
		assert.deepEqual([...view1.root], ["A", "C"]);

		// Have tree1 make a summary
		// Summarized state: A C
		await provider.summarize();

		// Insert B between A and C (without knowing of Z being removed)
		view3.root.insertAt(2, "B");

		// Ensure the insertion of B is sent for processing by tree3 before tree3 receives the deletion of Z
		await provider.opProcessingController.processOutgoing(container3);

		// Allow tree3 to receive further changes (i.e., the deletion of Z)
		provider.opProcessingController.resumeProcessing(container3);

		// Ensure all trees are now caught up
		await provider.ensureSynchronized();

		// Load the last summary (state: "AC") and process the deletion of Z and insertion of B
		const view4 = (await provider.createTree()).viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);

		// Ensure tree4 has a chance to process trailing ops.
		await provider.ensureSynchronized();

		// Trees 1 through 3 should get the correct end state (ABC) whether we include EditManager data
		// in summaries or not.
		const expectedValues = ["A", "B", "C"];
		assert.deepEqual([...view1.root], expectedValues);
		assert.deepEqual([...view2.root], expectedValues);
		assert.deepEqual([...view3.root], expectedValues);
		// tree4 should only get the correct end state if it was able to get the adequate
		// EditManager state from the summary. Specifically, in order to correctly rebase the insert
		// of B, tree4 needs to have a local copy of the edit that removed Z, so it can
		// rebase the insertion of  B over that edit.
		// Without that, it will interpret the insertion of B based on the current state, yielding
		// the order ACB.
		assert.deepEqual([...view4.root], expectedValues);
	});

	it("can load a summary from a tree and receive edits of the new state", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;
		const view = summarizingTree.viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view.initialize(["a", "b", "c"]);
		await provider.ensureSynchronized();
		await provider.summarize();
		const loadingTree = await provider.createTree();
		view.root.removeAt(0);
		await provider.ensureSynchronized();
		validateTreeContent(loadingTree.kernel.checkout, {
			schema: StringArray,
			initialTree: singleJsonCursor(["b", "c"]),
		});
	});

	it("can load a summary while detached", async () => {
		// This test exercises the case where a detached tree loads a summary from another detached tree.
		// Both trees in this test are detached for the whole duration of the test (because of the `attachState` argument passed to the mock runtime below).
		// Detached trees are not connected to the sequencing service, but they still "sequence" their edits as if they were totally ordered.
		// The second tree must take care to avoid sequencing its edits with sequence numbers that the first tree already used.
		// If it doesn't, the second tree will throw an error when trying to sequence a commit with sequence number that has "gone backwards" and this test will fail.
		const sharedTreeFactory = new TreeFactory({});
		const runtime = new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor(),
			attachState: AttachState.Detached,
		});
		const tree = sharedTreeFactory.create(runtime, "tree");
		const runtimeFactory = new MockContainerRuntimeFactory();
		runtimeFactory.createContainerRuntime(runtime);

		const view = tree.viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view.initialize(["a"]);
		// Create a branch to prevent the EditManager from evicting all of its commits - otherwise, the summary won't have these edits in the trunk.
		getBranch(tree).branch();
		view.root.insertAtEnd("b");

		const tree2 = sharedTreeFactory.create(runtime, "tree2");
		await tree2.load({
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary((await tree.summarize()).summary),
		});

		const loadedView = tree2.viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);

		loadedView.root.insertAtEnd("c");

		validateTreeContent(tree2.kernel.checkout, {
			schema: StringArray,
			initialTree: singleJsonCursor(["a", "b", "c"]),
		});
	});

	it("can load a summary from a tree and receive edits that require detached tree refreshers", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;
		const view = summarizingTree.viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		view.initialize(["a", "b", "c"]);

		const { undoStack, unsubscribe } = createTestUndoRedoStacks(
			summarizingTree.kernel.checkout.events,
		);

		view.root.removeAt(0);

		validateTreeContent(summarizingTree.kernel.checkout, {
			schema: StringArray,
			initialTree: singleJsonCursor(["b", "c"]),
		});

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = await provider.createTree();

		const revertible = undoStack.pop();
		assert(revertible !== undefined, "expected undo stack to have an entry");
		revertible.revert();

		validateTreeContent(summarizingTree.kernel.checkout, {
			schema: StringArray,
			initialTree: singleJsonCursor(["a", "b", "c"]),
		});

		await provider.ensureSynchronized();

		validateTreeContent(loadingTree.kernel.checkout, {
			schema: StringArray,
			initialTree: singleJsonCursor(["a", "b", "c"]),
		});
		unsubscribe();
	});

	it("can summarize local edits in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			const view = tree.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view.initialize([]);
			view.root.insertAtStart("A");
			view.root.insertAtEnd("C");
			assert.deepEqual([...view.root], ["A", "C"]);
			view.dispose();
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		assert.deepEqual([...view1.root], ["A", "C"]);
		await provider.ensureSynchronized();
		const tree2 = await provider.createTree();
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);

		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual([...view2.root], ["A", "C"]);

		// Check that further edits are interpreted properly
		view1.root.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual([...view1.root], ["A", "B", "C"]);
		assert.deepEqual([...view2.root], ["A", "B", "C"]);
	});

	it("can tolerate local edits submitted as part of a transaction in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			// Schematize uses a transaction as well
			const view = tree.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view.initialize([]);
			Tree.runTransaction(view, () => {
				view.root.insertAtStart("A");
				view.root.insertAt(1, "C");
			});
			assert.deepEqual([...view.root], ["A", "C"]);
			view.dispose();
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		assert.deepEqual([...view1.root], ["A", "C"]);
		const tree2 = await provider.createTree();
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual([...view2.root], ["A", "C"]);

		// Check that further edits are interpreted properly
		view1.root.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual([...view1.root], ["A", "B", "C"]);
		assert.deepEqual([...view2.root], ["A", "B", "C"]);
	});

	// AB#5745: Enable this test once it passes.
	// TODO: above mentioned task is done, but this still fails. Fix it.
	it.skip("can tolerate incomplete transactions when attaching", async () => {
		const onCreate = (tree: SharedTree) => {
			const view = tree.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view.initialize([]);
			const viewUpgrade = tree.viewWith(
				new TreeViewConfiguration({ schema: JsonArray, enableSchemaValidation }),
			);
			viewUpgrade.upgradeSchema();
			tree.kernel.checkout.transaction.start();
			viewUpgrade.root.insertAtStart("A");
			viewUpgrade.root.insertAt(1, "C");
			assert.deepEqual([...viewUpgrade.root], ["A", "C"]);
			viewUpgrade.dispose();
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		view1.initialize([]);
		assert.deepEqual([...view1.root], ["A", "C"]);
		const tree2 = await provider.createTree();
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		tree1.kernel.checkout.transaction.commit();
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual(tree2, []);

		await provider.ensureSynchronized();
		assert.deepEqual([...view1.root], ["A", "C"]);
		assert.deepEqual([...view2.root], ["A", "C"]);

		// Check that further edits are interpreted properly
		view1.root.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual([...view1.root], ["A", "B", "C"]);
		assert.deepEqual([...view2.root], ["A", "B", "C"]);
	});

	it("has bounded memory growth in EditManager", () => {
		const provider = new TestTreeProviderLite(2);
		const viewInit = provider.trees[0].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		viewInit.initialize([]);
		viewInit.dispose();
		provider.processMessages();

		const [view1, view2] = provider.trees.map((t) =>
			t.viewWith(new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation })),
		);

		// Make some arbitrary number of edits
		for (let i = 0; i < 10; ++i) {
			view1.root.insertAtStart("");
		}

		provider.processMessages();

		// These two edit will have ref numbers that correspond to the last of the above edits
		view1.root.insertAtStart("");
		view2.root.insertAtStart("");

		// This synchronization point should ensure that both trees see the edits with the higher ref numbers.
		provider.processMessages();

		// It's not clear if we'll ever want to expose the EditManager to ISharedTree consumers or
		// if we'll ever expose some memory stats in which the trunk length would be included.
		// If we do then this test should be updated to use that code path.
		interface EditManagerKludge {
			kernel?: {
				editManager?: EditManager<
					ChangeFamilyEditor,
					unknown,
					ChangeFamily<ChangeFamilyEditor, unknown>
				>;
			};
		}
		const t1 = provider.trees[0] as unknown as EditManagerKludge;
		const t2 = provider.trees[1] as unknown as EditManagerKludge;
		assert(
			t1.kernel?.editManager !== undefined && t2.kernel?.editManager !== undefined,
			"EditManager has moved. This test must be updated.",
		);
		assert(t1.kernel.editManager.getTrunkChanges().length < 10);
		assert(t2.kernel.editManager.getTrunkChanges().length < 10);
	});

	it("can process changes while detached", async () => {
		const onCreate = (t: SharedTree) => {
			const viewInit = t.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			viewInit.initialize([]);
			viewInit.root.insertAtStart("B");
			viewInit.root.insertAtStart("A");
			assert.deepEqual([...viewInit.root], ["A", "B"]);
			viewInit.dispose();
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const view = provider.trees[0].viewWith(
			new TreeViewConfiguration({
				schema: StringArray,
				enableSchemaValidation,
			}),
		);
		assert.deepEqual([...view.root], ["A", "B"]);
	});

	describe("Undo and redo", () => {
		it("the insert of a node in a sequence field using the commitApplied event", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize([]);

			const undoStack: Revertible[] = [];
			const redoStack: Revertible[] = [];

			function onDispose(disposed: Revertible): void {
				const redoIndex = redoStack.indexOf(disposed);
				if (redoIndex !== -1) {
					redoStack.splice(redoIndex, 1);
				} else {
					const undoIndex = undoStack.indexOf(disposed);
					if (undoIndex !== -1) {
						undoStack.splice(undoIndex, 1);
					}
				}
			}

			const unsubscribeFromCommitAppliedEvent = view1.events.on(
				"commitApplied",
				(commit, getRevertible) => {
					if (getRevertible !== undefined) {
						const revertible = getRevertible(onDispose);
						if (commit.kind === CommitKind.Undo) {
							redoStack.push(revertible);
						} else {
							undoStack.push(revertible);
						}
					}
				},
			);
			const unsubscribe = (): void => {
				unsubscribeFromCommitAppliedEvent();
				for (const revertible of undoStack) {
					revertible.dispose();
				}
				for (const revertible of redoStack) {
					revertible.dispose();
				}
			};

			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			provider.processMessages();

			// Insert node
			view1.root.insertAtStart(value);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...view2.root], [value]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], []);
			assert.deepEqual([...view2.root], []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], [value]);
			assert.deepEqual([...view2.root], [value]);
			unsubscribe();
		});

		it("the insert of a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize([]);
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.kernel.checkout.events,
			);
			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			provider.processMessages();

			// Insert node
			view1.root.insertAtStart(value);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...view2.root], [value]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], []);
			assert.deepEqual([...view2.root], []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], [value]);
			assert.deepEqual([...view2.root], [value]);
			unsubscribe();
		});

		it("inserts of multiple nodes in a sequence field", () => {
			const value = "A";
			const value2 = "B";
			const value3 = "C";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize([]);
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.kernel.checkout.events,
			);
			provider.processMessages();
			const view2 = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			provider.processMessages();

			// Insert node
			view1.root.insertAtStart(value3);
			view1.root.insertAtStart(value2);
			view1.root.insertAtStart(value);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...view1.root], [value, value2, value3]);
			assert.deepEqual([...view2.root], [value, value2, value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], [value2, value3]);
			assert.deepEqual([...view2.root], [value2, value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], [value3]);
			assert.deepEqual([...view2.root], [value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], []);
			assert.deepEqual([...view2.root], []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...view1.root], [value3]);
			assert.deepEqual([...view2.root], [value3]);
			unsubscribe();
		});

		it("rebased edits", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize(["A", "B", "C", "D"]);

			const {
				undoStack: undoStack1,
				redoStack: redoStack1,
				unsubscribe: unsubscribe1,
			} = createTestUndoRedoStacks(tree1.kernel.checkout.events);

			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			const {
				undoStack: undoStack2,
				redoStack: redoStack2,
				unsubscribe: unsubscribe2,
			} = createTestUndoRedoStacks(tree2.kernel.checkout.events);

			const initialState = {
				schema: StringArray,
				initialTree: singleJsonCursor(["A", "B", "C", "D"]),
			};

			// Validate insertion
			validateTreeContent(tree2.kernel.checkout, initialState);

			const root1 = view1.root;
			const root2 = view2.root;
			// Insert nodes on both trees
			root1.insertAt(1, "x");
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, "y");
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			undoStack1.pop()?.revert();
			assert.deepEqual([...root1], ["A", "B", "C", "y", "D"]);

			undoStack2.pop()?.revert();
			assert.deepEqual([...root2], ["A", "x", "B", "C", "D"]);

			provider.processMessages();
			validateTreeContent(tree1.kernel.checkout, initialState);
			validateTreeContent(tree2.kernel.checkout, initialState);

			// Insert additional node at the beginning to require rebasing
			root1.insertAt(0, "0");
			assert.deepEqual([...root1], ["0", "A", "B", "C", "D"]);

			const expectedAfterRedo = ["0", "A", "x", "B", "C", "y", "D"];
			// Redo node insertion on both trees
			redoStack1.pop()?.revert();
			assert.deepEqual([...root1], ["0", "A", "x", "B", "C", "D"]);

			redoStack2.pop()?.revert();
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D"]);

			provider.processMessages();
			assert.deepEqual([...view1.root], expectedAfterRedo);
			assert.deepEqual([...view2.root], expectedAfterRedo);
			unsubscribe1();
			unsubscribe2();
		});

		/**
		 * the collab window includes all sequenced edits after the minimum sequence number
		 * these tests test that undoing edits behind (i.e., with a seq# less than) the minimum sequence number works
		 */
		it("refresher for detached trees out of collab window", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize(["A", "B", "C", "D"]);

			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.kernel.checkout.events,
			);

			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);

			const root1 = view1.root;
			const root2 = view2.root;

			// get an anchor to the node we're removing
			const anchorAOnTree2 = TestAnchor.fromValue(tree2.kernel.checkout.forest, "A");

			// remove in first treex
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// check the detached field on the peer
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Removed);

			// send edits to move the collab window up
			root2.insertAt(3, "y");
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();
			root2.insertAt(3, "y");
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();

			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);
			// check that the repair data on the peer is destroyed
			assert.equal(anchorAOnTree2.treeStatus, TreeStatus.Deleted);

			undoStack[0]?.revert();

			provider.processMessages();
			assert.deepEqual([...root1], ["A", "B", "C", "D"]);
			assert.deepEqual([...root2], ["A", "B", "C", "D"]);

			assert.equal(redoStack.length, 1);
			redoStack.pop()?.revert();

			provider.processMessages();
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			unsubscribe();
		});

		describe("can concurrently restore and edit removed tree", () => {
			const sf = new SchemaFactory(undefined);
			const innerSchema = sf.array(sf.string);
			const schema = sf.array(innerSchema);

			for (const scenario of ["restore then change", "change then restore"]) {
				it(`with the ${scenario} sequenced`, () => {
					const provider = new TestTreeProviderLite(2);
					const tree1 = provider.trees[0];
					const view1 = tree1.viewWith(
						new TreeViewConfiguration({ schema, enableSchemaValidation }),
					);
					view1.initialize([["a"]]);

					const { undoStack: undoStack1, unsubscribe: unsubscribe1 } =
						createTestUndoRedoStacks(tree1.kernel.checkout.events);

					// This test does not correctly handle views getting invalidated by schema changes, so avoid concurrent schematize
					// which causes view invalidation when resolving the merge.
					provider.processMessages();

					const tree2 = provider.trees[1];
					const view2 = tree2.viewWith(
						new TreeViewConfiguration({ schema, enableSchemaValidation }),
					);
					const { undoStack: undoStack2, unsubscribe: unsubscribe2 } =
						createTestUndoRedoStacks(tree2.kernel.checkout.events);

					provider.processMessages();

					// Validate insertion
					validateTreeContent(tree2.kernel.checkout, {
						schema,
						initialTree: cursorFromInsertable(schema, [["a"]]),
					});

					// edit subtree
					const outerList = view2.root;
					const innerList = outerList.at(0) ?? assert.fail();
					innerList.insertAtEnd("b");
					provider.processMessages();
					assert.deepEqual([...(view1.root.at(0) ?? assert.fail())], ["a", "b"]);
					assert.deepEqual([...innerList], ["a", "b"]);

					// remove subtree
					view1.root.removeAt(0);
					provider.processMessages();
					assert.deepEqual([...view1.root], []);
					assert.deepEqual([...view2.root], []);

					if (scenario === "restore then change") {
						undoStack1.pop()?.revert();
						undoStack2.pop()?.revert();
					} else {
						undoStack2.pop()?.revert();
						undoStack1.pop()?.revert();
					}

					provider.processMessages();
					// check the undo happened
					assert.deepEqual([...(view1.root.at(0) ?? assert.fail())], ["a"]);
					assert.deepEqual([...(view2.root.at(0) ?? assert.fail())], ["a"]);

					unsubscribe1();
					unsubscribe2();
				});
			}
		});

		describe("can rebase during resubmit", () => {
			const sf = new SchemaFactory("shared tree undo tests");
			const innerListSchema = sf.array(sf.string);
			const schema = sf.array(innerListSchema);

			interface Peer extends ConnectionSetter {
				readonly checkout: TreeCheckout;
				readonly view: TreeViewAlpha<typeof schema>;
				readonly outerList: TreeFieldFromImplicitField<typeof schema>;
				readonly innerList: TreeFieldFromImplicitField<typeof innerListSchema>;
				assertOuterListEquals(expected: readonly (readonly string[])[]): void;
				assertInnerListEquals(expected: readonly string[]): void;
			}

			function makeUndoableEdit(peer: Peer, edit: () => void): Revertible {
				const undos: Revertible[] = [];
				const unsubscribe = peer.view.events.on("changed", ({ kind }, getRevertible) => {
					if (kind !== CommitKind.Undo && getRevertible !== undefined) {
						undos.push(getRevertible());
					}
				});

				edit();
				unsubscribe();
				assert.equal(undos.length, 1);
				return undos[0];
			}

			function undoableInsertInInnerList(peer: Peer, value: string): Revertible {
				return makeUndoableEdit(peer, () => {
					peer.innerList.insertAtEnd(value);
				});
			}

			function undoableRemoveOfOuterList(peer: Peer): Revertible {
				return makeUndoableEdit(peer, () => {
					peer.outerList.removeAt(0);
				});
			}

			function peerFromSharedTree(tree: SharedTreeWithConnectionStateSetter): Peer {
				const view = tree.viewWith(
					new TreeViewConfiguration({ schema, enableSchemaValidation }),
				);
				if (view.compatibility.canInitialize) {
					view.initialize([["a"]]);
				}
				return {
					checkout: tree.kernel.checkout,
					view,
					outerList: view.root,
					innerList: view.root.at(0) ?? assert.fail(),
					setConnected: tree.setConnected,
					assertOuterListEquals(expected: readonly (readonly string[])[]) {
						const actual = [...this.outerList].map((inner) => [...inner]);
						assert.deepEqual(actual, expected);
					},
					assertInnerListEquals(expected: readonly string[]) {
						const actual = [...this.innerList];
						assert.deepEqual(actual, expected);
					},
				};
			}

			function setupResubmitTest(): {
				provider: TestTreeProviderLite;
				submitter: Peer;
				resubmitter: Peer;
			} {
				const provider = new TestTreeProviderLite(2);
				const submitter = peerFromSharedTree(provider.trees[0]);
				provider.processMessages();
				const resubmitter = peerFromSharedTree(provider.trees[1]);
				provider.processMessages();
				return { provider, submitter, resubmitter };
			}

			/**
			 * These tests follow a pattern:
			 * 1. Two peers are setup with a two-level tree of nested lists.
			 * 2. Edits are made to the inner list by both peers.
			 * One of the peers removes the inner list.
			 * 4. The "resubmitter" peer is disconnected and reverts its stage-2 edits.
			 * Concurrently, the "submitter" peer also reverts its stage-2 edits (while connected).
			 * 5. The "resubmitter" peer is reconnected, forcing its edits to go through a resubmit where they are rebased
			 * over the edits made by the "submitter" peer.
			 */
			for (const scenario of ["restore and edit", "edit and restore"] as const) {
				it(`${scenario} to the removed tree over two edits to the removed tree`, () => {
					const { provider, submitter, resubmitter } = setupResubmitTest();

					const rEdit = undoableInsertInInnerList(resubmitter, "r");
					const rRemove = undoableRemoveOfOuterList(resubmitter);
					const s1 = undoableInsertInInnerList(submitter, "s1");
					const s2 = undoableInsertInInnerList(submitter, "s2");

					provider.processMessages();

					submitter.assertOuterListEquals([]);
					resubmitter.assertOuterListEquals([]);
					const initialState = ["a", "s1", "s2", "r"];
					submitter.assertInnerListEquals(initialState);
					resubmitter.assertInnerListEquals(initialState);

					resubmitter.setConnected(false);

					s2.revert();
					s1.revert();
					submitter.assertOuterListEquals([]);
					submitter.assertInnerListEquals(["a", "r"]);

					provider.processMessages();

					if (scenario === "restore and edit") {
						rRemove.revert();
						rEdit.revert();
					} else {
						rEdit.revert();
						rRemove.revert();
					}
					resubmitter.assertOuterListEquals([["a", "s1", "s2"]]);

					resubmitter.setConnected(true);
					provider.processMessages();

					const finalState = [["a"]];
					submitter.assertOuterListEquals(finalState);
					resubmitter.assertOuterListEquals(finalState);
				});

				it(`two edits to the removed tree over ${scenario} to the removed tree`, () => {
					const { provider, submitter, resubmitter } = setupResubmitTest();

					const r1 = undoableInsertInInnerList(resubmitter, "r1");
					const r2 = undoableInsertInInnerList(resubmitter, "r2");
					const sEdit = undoableInsertInInnerList(submitter, "s");
					const sRemove = undoableRemoveOfOuterList(submitter);

					provider.processMessages();

					submitter.assertOuterListEquals([]);
					resubmitter.assertOuterListEquals([]);
					const initialState = ["a", "s", "r1", "r2"];
					submitter.assertInnerListEquals(initialState);
					resubmitter.assertInnerListEquals(initialState);

					resubmitter.setConnected(false);

					if (scenario === "restore and edit") {
						sRemove.revert();
						sEdit.revert();
					} else {
						sEdit.revert();
						sRemove.revert();
					}
					submitter.assertOuterListEquals([["a", "r1", "r2"]]);

					provider.processMessages();

					r2.revert();
					r1.revert();
					resubmitter.assertOuterListEquals([]);
					resubmitter.assertInnerListEquals(["a", "s"]);

					resubmitter.setConnected(true);
					provider.processMessages();

					const finalState = [["a"]];
					submitter.assertOuterListEquals(finalState);
					resubmitter.assertOuterListEquals(finalState);
				});
			}

			it("the restore of a tree edited on a branch", () => {
				const { provider, submitter, resubmitter } = setupResubmitTest();

				resubmitter.setConnected(false);

				// This is the edit that will be rebased over during the re-submit phase
				undoableInsertInInnerList(submitter, "s");
				provider.processMessages();

				// fork the tree
				const branch = resubmitter.checkout.branch();

				// edit the removed tree on the fork
				const branchView = new SchematizingSimpleTreeView(
					branch,
					new TreeViewConfiguration({ schema, enableSchemaValidation }),
					new MockNodeKeyManager(),
				);
				const outerList = branchView.root;
				const innerList = outerList.at(0) ?? assert.fail();
				innerList.insertAtEnd("f");

				const rRemove = undoableRemoveOfOuterList(resubmitter);
				resubmitter.checkout.merge(branch);
				resubmitter.assertOuterListEquals([]);
				resubmitter.assertInnerListEquals(["a", "f"]);

				rRemove.revert();
				resubmitter.assertOuterListEquals([["a", "f"]]);

				resubmitter.setConnected(true);
				provider.processMessages();

				const finalState = [["a", "f", "s"]];
				resubmitter.assertOuterListEquals(finalState);
				submitter.assertOuterListEquals(finalState);
			});
		});
	});

	describe("Events", () => {
		it("doesn't trigger a revertible event for rebases", () => {
			const provider = new TestTreeProviderLite(2);
			// Initialize the tree
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize(["A", "B", "C", "D"]);
			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);

			// Validate initialization
			validateViewConsistency(tree1.kernel.checkout, tree2.kernel.checkout);

			const { undoStack: undoStack1, unsubscribe: unsubscribe1 } = createTestUndoRedoStacks(
				tree1.kernel.checkout.events,
			);
			const { undoStack: undoStack2, unsubscribe: unsubscribe2 } = createTestUndoRedoStacks(
				tree2.kernel.checkout.events,
			);

			const root1 = view1.root;
			const root2 = view2.root;
			// Insert a node on tree 2
			root2.insertAt(4, "z");
			assert.deepEqual([...root2], ["A", "B", "C", "D", "z"]);

			// Insert nodes on both trees
			root1.insertAt(1, "x");
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, "y");
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D", "z"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 2);

			unsubscribe1();
			unsubscribe2();
		});

		it("emits a changed event for remote edits", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize([]);
			provider.processMessages();
			const tree2 = provider.trees[1];
			const view2 = tree2.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);

			let remoteEdits = 0;

			const unsubscribe = view1.events.on("changed", (metadata) => {
				if (metadata.isLocal !== true) {
					remoteEdits++;
				}
			});

			// Insert node
			view2.root.insertAtStart(value);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...view1.root], [value]);

			assert.equal(remoteEdits, 1);

			unsubscribe();
		});
	});

	describe("Rebasing", () => {
		it("rebases stashed ops with prior state present", async () => {
			const provider = await TestTreeProvider.create(2);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize(["a"]);
			await provider.ensureSynchronized();

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = view1;
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			pausedTree.root.insertAt(1, "b");
			pausedTree.root.insertAt(2, "c");
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const otherLoadedView = provider.trees[1].viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			otherLoadedView.root.insertAtStart("d");
			await provider.ensureSynchronized();

			const loadedContainer = await provider.loadTestContainer(
				undefined,
				undefined,
				pendingOps,
			);
			const dataStore = (await loadedContainer.getEntryPoint()) as ITestFluidObject;
			const tree = await dataStore.getSharedObject<SharedTree>("TestSharedTree");
			const view = tree.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();
			assert.deepEqual([...view.root], ["d", "a", "b", "c"]);
			assert.deepEqual([...otherLoadedView.root], ["d", "a", "b", "c"]);
		});
	});

	describe("Anchors", () => {
		it("Anchors can be created and dereferenced", () => {
			const provider = new TestTreeProviderLite();
			provider.trees[0]
				.viewWith(new TreeViewConfiguration({ schema: NumberArray, enableSchemaValidation }))
				.initialize([0, 1, 2]);
			const checkout = provider.trees[0].kernel.checkout;
			const cursor = checkout.forest.allocateCursor();
			moveToDetachedField(checkout.forest, cursor);

			cursor.enterNode(0);
			cursor.enterField(EmptyKey);
			cursor.enterNode(0);
			cursor.seekNodes(1);
			const anchor = cursor.buildAnchor();
			cursor.free();
			const childPath = checkout.locate(anchor);
			const expected: UpPath = {
				parent: {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				},
				parentField: EmptyKey,
				parentIndex: 1,
			};
			assert(compareUpPaths(childPath, expected));
		});
	});

	it("don't send ops before committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		view1.initialize([]);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		Tree.runTransaction(view1, () => {
			view1.root.insertAtStart("x");
			provider.processMessages();
			assert.equal(opsReceived, 0);
		});
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual(
			[
				...tree2.viewWith(
					new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
				).root,
			],
			["x"],
		);
	});

	it("send only one op after committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		view1.initialize([]);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		Tree.runTransaction(view1, () => {
			view1.root.insertAtStart("B");
			view1.root.insertAtStart("A");
		});
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual(
			[
				...tree2.viewWith(
					new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
				).root,
			],
			["A", "B"],
		);
	});

	it("do not send an op after committing if nested", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0];
		const view1 = tree1.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		view1.initialize([]);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		const view2 = tree2.viewWith(
			new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
		);
		Tree.runTransaction(view1, () => {
			Tree.runTransaction(view1, () => {
				view1.root.insertAtStart("A");
			});
			provider.processMessages();
			assert.equal(opsReceived, 0);
			assert.deepEqual([...view2.root], []);
			view1.root.insertAtEnd("B");
		});
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual([...view2.root], ["A", "B"]);
	});

	it("process changes while detached", async () => {
		const onCreate = (parentTree: SharedTree) => {
			const parentView = parentTree.viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			parentView.initialize(["A"]);
			Tree.runTransaction(parentView, () => {
				parentView.root.insertAtStart("B");
			});
			const childCheckout = parentTree.kernel.checkout.branch();
			const childView = new SchematizingSimpleTreeView(
				childCheckout,
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
				new MockNodeKeyManager(),
			);
			Tree.runTransaction(childView, () => {
				childView.root.insertAtStart("C");
			});
			parentTree.kernel.checkout.merge(childCheckout);
			childView.dispose();
			assert.deepEqual([...parentView.root], ["C", "B", "A"]);
			parentView.dispose();
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const [tree] = provider.trees;
		assert.deepEqual(
			[
				...tree.viewWith(
					new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
				).root,
			],
			["C", "B", "A"],
		);
	});

	it("doesn't submit an op for a change that crashes", () => {
		const provider = new TestTreeProviderLite(2);
		const [tree1, tree2] = provider.trees;

		tree2.on("pre-op", () => {
			assert.fail();
		});

		assert.throws(() =>
			// This change is a well-formed change object, but will attempt to do an operation that is illegal given the current (empty) state of the tree
			tree1.kernel
				.getEditor()
				.sequenceField({ parent: undefined, field: rootFieldKey })
				.remove(0, 99),
		);

		provider.processMessages();
	});

	describe("Schema changes", () => {
		it("handles two trees schematizing identically at the same time", async () => {
			const provider = await TestTreeProvider.create(2, SummarizeType.disabled);
			const [tree1, tree2] = provider.trees;
			const value1 = "42";
			const value2 = "42";

			const view1 = tree1.viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			view1.initialize([value1]);

			tree2
				.viewWith(
					new TreeViewConfiguration({
						schema: StringArray,
						enableSchemaValidation,
					}),
				)
				.initialize([value2]);

			await provider.ensureSynchronized();
			assert.deepEqual([...view1.root], [value1]);
			expectSchemaEqual(tree2.kernel.storedSchema, toStoredSchema(StringArray));
			validateTreeConsistency(tree1, tree2);
		});

		it("do not break encoding for resubmitted data changes", () => {
			const provider = new TestTreeProviderLite(1);
			const tree1 = provider.trees[0];
			const view1 = tree1.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view1.initialize(["42"]);

			provider.processMessages();

			tree1.setConnected(false);

			view1.root.insertAtEnd("43");
			view1.dispose();

			const view1Json = tree1.viewWith(
				new TreeViewConfiguration({ schema: JsonArray, enableSchemaValidation }),
			);
			view1Json.upgradeSchema();
			// TODO:#8915: This should be able to insert the _number_ 44, not the string, but currently cannot - see bug #8915
			view1Json.root.insertAtEnd("44");

			tree1.setConnected(true);

			provider.processMessages();

			assert.deepEqual([...view1Json.root].length, 3);
		});

		// Undoing schema changes is not supported because it may render some of the forest contents invalid.
		// This may be revisited in the future.
		it.skip("can be undone at the tip", async () => {
			const provider = await TestTreeProvider.create(2, SummarizeType.disabled);

			const tree = provider.trees[0];
			const { undoStack } = createTestUndoRedoStacks(tree.kernel.checkout.events);

			const view = tree.viewWith(
				new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }),
			);
			view.initialize([]);
			expectSchemaEqual(tree.kernel.storedSchema, toStoredSchema(StringArray));

			tree
				.viewWith(new TreeViewConfiguration({ schema: JsonArray, enableSchemaValidation }))
				.upgradeSchema();
			expectSchemaEqual(tree.kernel.storedSchema, toStoredSchema(JsonArray));

			const revertible = undoStack.pop();
			revertible?.revert();

			expectSchemaEqual(tree.kernel.storedSchema, toStoredSchema(StringArray));
		});
	});

	describe("Stashed ops", () => {
		// Fails because 'ranges finalized out of order' in deltaQueue.ts on the ensureSynchronized call.
		// This doesn't bubble up b/c of issues using TestTreeProvider without proper listening to errors coming
		// from containers.
		it("can apply and resubmit stashed schema ops", async () => {
			const provider = await TestTreeProvider.create(2);

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = provider.trees[0];
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			const pausedView = pausedTree.viewWith(
				new TreeViewConfiguration({
					schema: StringArray,
					enableSchemaValidation,
				}),
			);
			pausedView.initialize([]);
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const loadedContainer = await provider.loadTestContainer(
				undefined,
				undefined,
				pendingOps,
			);
			const dataStore = (await loadedContainer.getEntryPoint()) as ITestFluidObject;
			const tree = await dataStore.getSharedObject<ITreePrivate>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();

			const otherLoadedTree = provider.trees[1];
			expectSchemaEqual(tree.contentSnapshot().schema, toStoredSchema(StringArray));
			expectSchemaEqual(otherLoadedTree.kernel.storedSchema, toStoredSchema(StringArray));
		});
	});

	describe("Creates a SharedTree using specific ForestType", () => {
		it("unspecified ForestType uses ObjectForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new TreeFactory({
					jsonValidator: typeboxValidator,
				}),
			);
			assert.equal(trees[0].kernel.checkout.forest instanceof ObjectForest, true);
		});

		it("ForestType.Reference uses ObjectForest with additionalAsserts flag set to false", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new TreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestTypeReference,
				}),
			);
			const forest = trees[0].kernel.checkout.forest;
			assert(forest instanceof ObjectForest);
			assert.equal(forest.additionalAsserts, false);
		});

		it("ForestType.Optimized uses ChunkedForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new TreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestTypeOptimized,
				}),
			);
			assert.equal(trees[0].kernel.checkout.forest instanceof ChunkedForest, true);
		});

		it("ForestType.Expensive uses ObjectForest with additionalAsserts flag set to true", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new TreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestTypeExpensiveDebug,
				}),
			);
			const forest = trees[0].kernel.checkout.forest;
			assert(forest instanceof ObjectForest);
			assert.equal(forest.additionalAsserts, true);
		});
	});
	describe("Schema based op encoding", () => {
		// TODO:#8915: This test will fail until bug #8915 is fixed
		it.skip("uses the correct schema for subsequent edits after schema change.", async () => {
			const factory = new TreeFactory({
				jsonValidator: typeboxValidator,
				treeEncodeType: TreeCompressionStrategy.Compressed,
			});
			const provider = new TestTreeProviderLite(2, factory);
			const tree = provider.trees[0];

			// Initial schema which allows sequence of strings under field "foo".
			const sf = new SchemaFactory("op-encoding-test-schema");
			const schema = sf.object("Node", { foo: sf.array("array", sf.string) });

			// Updated schema which allows all primitives under field "foo".
			const sf2 = new SchemaFactory("op-encoding-test-schema");
			const schema2 = sf2.object("Node", {
				foo: sf.array("array", [sf.boolean, sf.number, sf.string]),
			});

			const view = tree.viewWith(
				new TreeViewConfiguration({ schema, enableSchemaValidation }),
			);
			Tree.runTransaction(view, () => {
				view.initialize({ foo: [] });
				view.root.foo.insertAtStart("a");
				view.root.foo.insertAtStart("b");

				// Update schema which now allows all primitives under field "foo".
				const view2 = tree.viewWith(
					new TreeViewConfiguration({ schema: schema2, enableSchemaValidation }),
				);
				view2.upgradeSchema();
				view2.root.foo.insertAtStart(1);
			});
			provider.processMessages();

			assert.deepEqual(
				tree.viewWith(new TreeViewConfiguration({ schema: schema2, enableSchemaValidation }))
					.root,
				{
					foo: [1, "b", "a"],
				},
			);
		});

		it("properly encodes ops using specified compression strategy", async () => {
			// Check that ops are using uncompressed encoding with "Uncompressed" treeEncodeType
			const factory = new TreeFactory({
				jsonValidator: typeboxValidator,
				treeEncodeType: TreeCompressionStrategy.Uncompressed,
			});
			const provider = await TestTreeProvider.create(1, SummarizeType.onDemand, factory);
			provider.trees[0]
				.viewWith(new TreeViewConfiguration({ schema: StringArray, enableSchemaValidation }))
				.initialize(["A", "B", "C"]);

			await provider.ensureSynchronized();
			const summary = (await provider.trees[0].summarize()).summary;
			const indexesSummary = summary.tree.indexes;
			assert(indexesSummary.type === SummaryType.Tree);
			const editManagerSummary = indexesSummary.tree.EditManager;
			assert(editManagerSummary.type === SummaryType.Tree);
			const editManagerSummaryBlob = editManagerSummary.tree.String;
			assert(editManagerSummaryBlob.type === SummaryType.Blob);
			const changesSummary = JSON.parse(editManagerSummaryBlob.content as string);
			const encodedTreeData = changesSummary.trunk[0].change[1].data.builds.trees;
			const expectedUncompressedTreeData = [
				"com.fluidframework.json.array",
				false,
				[
					EmptyKey,
					[
						"com.fluidframework.leaf.string",
						true,
						"A",
						[],
						"com.fluidframework.leaf.string",
						true,
						"B",
						[],
						"com.fluidframework.leaf.string",
						true,
						"C",
						[],
					],
				],
			];
			assert.deepEqual(encodedTreeData.data[0][1], expectedUncompressedTreeData);

			// Check that ops are encoded using schema based compression with "Compressed" treeEncodeType
			const factory2 = new TreeFactory({
				jsonValidator: typeboxValidator,
				treeEncodeType: TreeCompressionStrategy.Compressed,
			});
			const provider2 = await TestTreeProvider.create(1, SummarizeType.onDemand, factory2);

			provider2.trees[0]
				.viewWith(
					new TreeViewConfiguration({
						schema: StringArray,
						enableSchemaValidation,
					}),
				)
				.initialize(["A", "B", "C"]);

			await provider2.ensureSynchronized();
			const summary2 = (await provider2.trees[0].summarize()).summary;
			const indexesSummary2 = summary2.tree.indexes;
			assert(indexesSummary2.type === SummaryType.Tree);
			const editManagerSummary2 = indexesSummary2.tree.EditManager;
			assert(editManagerSummary2.type === SummaryType.Tree);
			const editManagerSummaryBlob2 = editManagerSummary2.tree.String;
			assert(editManagerSummaryBlob2.type === SummaryType.Blob);
			const changesSummary2 = JSON.parse(editManagerSummaryBlob2.content as string);
			const encodedTreeData2 = changesSummary2.trunk[0].change[1].data.builds.trees;
			const expectedCompressedTreeData = ["A", "B", "C"];
			assert.deepEqual(encodedTreeData2.data[0][1], expectedCompressedTreeData);
		});
	});

	describe("Identifiers", () => {
		it("Can use identifiers and the static Tree Apis", async () => {
			const factory = new TreeFactory({
				jsonValidator: typeboxValidator,
				treeEncodeType: TreeCompressionStrategy.Compressed,
			});
			const provider = new TestTreeProviderLite(1, factory, true);
			const tree1 = provider.trees[0];
			const sf = new SchemaFactory("com.example");
			class Widget extends sf.object("Widget", { id: sf.identifier }) {}

			const view = tree1.viewWith(
				new TreeViewConfiguration({
					schema: sf.array(Widget),
					enableSchemaValidation,
				}),
			);
			const widget = new Widget({});
			const fidget = new Widget({ id: "fidget" });
			view.initialize([widget, fidget]);

			// Checks that the shortId returns the correct types and values.
			assert.equal(typeof Tree.shortId(widget), "number");
			assert.equal(Tree.shortId(fidget), "fidget");
		});
	});

	describe("Schema validation", () => {
		it("can create tree with schema validation enabled", async () => {
			const provider = new TestTreeProviderLite(1);
			const [sharedTree] = provider.trees;
			const sf = new SchemaFactory("test");
			const schema = sf.string;
			assert.doesNotThrow(() => {
				const view = sharedTree.viewWith(
					new TreeViewConfiguration({ schema, enableSchemaValidation }),
				);
				view.initialize("42");
			});
		});
	});

	// Note: this is basically a more e2e version of some tests for `toMapTree`.
	it("throws when an invalid type is inserted at runtime", async () => {
		const provider = new TestTreeProviderLite(1);
		const [sharedTree] = provider.trees;
		const sf = new SchemaFactory("test");

		const schema = sf.object("myObject", { foo: sf.array("foo", sf.string) });
		const view = sharedTree.viewWith(
			new TreeViewConfiguration({ schema, enableSchemaValidation }),
		);
		view.initialize({ foo: ["42"] });
		assert.throws(
			() => {
				// The cast here is necessary as the API provided by `insertAtEnd` is typesafe with respect
				// to the schema, so in order to insert invalid content we need to bypass the types.
				view.root.foo.insertAtEnd(3 as unknown as string);
			},
			validateUsageError(
				/The provided data is incompatible with all of the types allowed by the schema/,
			),
		);
	});

	it("throws an error if attaching during a transaction", () => {
		const sharedTreeFactory = new TreeFactory({});
		const runtime = new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() });
		const tree = sharedTreeFactory.create(runtime, "tree");
		const runtimeFactory = new MockContainerRuntimeFactory();
		runtimeFactory.createContainerRuntime(runtime);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: StringArray }));
		view.initialize([]);
		assert.throws(
			() => {
				view.runTransaction(() => {
					tree.connect({
						deltaConnection: runtime.createDeltaConnection(),
						objectStorage: new MockStorage(),
					});
				});
			},
			validateUsageError(/^Cannot attach while a transaction is in progress/),
		);
	});

	it("breaks on exceptions", () => {
		const tree = treeTestFactory();
		const sf = new SchemaFactory("test");
		const schema = sf.object("myObject", {});
		const config = new TreeViewConfiguration({ schema, enableSchemaValidation });
		const view = tree.viewWith(config);

		view.initialize({});
		assert.equal(view.breaker, tree.kernel.breaker);
		// Invalid second initialize
		assert.throws(() => view.initialize({}), validateUsageError(/initialized more than once/));
		// Access after exception should throw broken object error
		assert.throws(() => view.root, validateUsageError(/invalid state by another error/));
		// Methods should throw
		assert.throws(
			() => view.initialize({}),
			validateUsageError(/invalid state by another error/),
		);
		// Methods on tree should throw after view broke
		assert.throws(
			() => tree.viewWith(config),
			validateUsageError(/invalid state by another error/),
		);
		// Inherited methods on tree should throw after view broke
		assert.throws(
			() => tree.getAttachSummary(),
			validateUsageError(/invalid state by another error/),
		);
	});

	it("exportVerbose & exportSimpleSchema", () => {
		const tree = treeTestFactory();
		assert.deepEqual(tree.exportVerbose(), undefined);
		assert.deepEqual(tree.exportSimpleSchema(), getSimpleSchema(SchemaFactory.optional([])));

		const config = new TreeViewConfiguration({
			schema: numberSchema,
		});
		const view = tree.viewWith(config);
		view.initialize(10);

		assert.deepEqual(tree.exportVerbose(), 10);
		assert.deepEqual(tree.exportSimpleSchema(), getSimpleSchema(numberSchema));
	});
});
