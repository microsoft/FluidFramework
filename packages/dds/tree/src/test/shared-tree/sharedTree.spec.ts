/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { createIdCompressor } from "@fluidframework/id-compressor";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ITestFluidObject, waitForContainerConnection } from "@fluidframework/test-utils";
import { IContainerExperimental } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
	cursorForJsonableTreeNode,
	Any,
	TreeStatus,
	TreeFieldSchema,
	SchemaBuilderInternal,
	FieldKinds,
	typeNameSymbol,
	FlexTreeSchema,
	intoStoredSchema,
} from "../../feature-libraries/index.js";
import {
	ChunkedForest,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/chunked-forest/chunkedForest.js";
import {
	ObjectForest,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/object-forest/objectForest.js";
import { brand, disposeSymbol, fail } from "../../util/index.js";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	emptyStringSequenceConfig,
	expectSchemaEqual,
	jsonSequenceRootSchema,
	stringSequenceRootSchema,
	validateTreeConsistency,
	validateTreeContent,
	validateViewConsistency,
	numberSequenceRootSchema,
} from "../utils.js";
import {
	ForestType,
	ISharedTree,
	FlexTreeView,
	InitializeAndSchematizeConfiguration,
	SharedTree,
	SharedTreeFactory,
} from "../../shared-tree/index.js";
import {
	compareUpPaths,
	FieldKey,
	rootFieldKey,
	UpPath,
	moveToDetachedField,
	AllowedUpdateType,
	storedEmptyFieldSchema,
} from "../../core/index.js";
import { typeboxValidator } from "../../external-utilities/index.js";
import { EditManager } from "../../shared-tree-core/index.js";
import { leaf, SchemaBuilder } from "../../domains/index.js";
import { SchemaFactory, TreeConfiguration } from "../../simple-tree/index.js";

const fooKey: FieldKey = brand("foo");

describe("SharedTree", () => {
	describe("schematize", () => {
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
		});

		const builder = new SchemaBuilder({
			scope: "test",
			name: "Schematize Tree Tests",
		});
		const schema = builder.intoSchema(SchemaBuilder.optional(leaf.number));
		const storedSchema = intoStoredSchema(schema);

		const builderGeneralized = new SchemaBuilder({
			scope: "test",
			name: "Schematize Tree Tests Generalized",
		});

		const schemaGeneralized = builderGeneralized.intoSchema(SchemaBuilder.optional(Any));
		const storedSchemaGeneralized = intoStoredSchema(schemaGeneralized);

		it("concurrent Schematize", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["x"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematizeInternal(content);
			provider.trees[1].schematizeInternal(content);
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], ["x"]);
		});

		it("initialize tree", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			);
			assert.deepEqual(tree.contentSnapshot().schema.rootFieldSchema, storedEmptyFieldSchema);

			const view = tree.schematizeInternal({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
			assert.equal(view.flexTree.content, 10);
		});

		it("noop upgrade", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			) as SharedTree;
			tree.checkout.updateSchema(storedSchema);

			// No op upgrade with AllowedUpdateType.None does not error
			const schematized = tree.schematizeInternal({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
			// And does not add initial tree:
			assert.equal(schematized.flexTree.content, undefined);
		});

		it("incompatible upgrade errors", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			) as SharedTree;
			tree.checkout.updateSchema(storedSchemaGeneralized);
			assert.throws(() => {
				tree.schematizeInternal({
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 5,
					schema,
				});
			});
		});

		it("upgrade schema", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			) as SharedTree;
			tree.checkout.updateSchema(storedSchema);
			const schematized = tree.schematizeInternal({
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				initialTree: 5,
				schema: schemaGeneralized,
			});
			// Initial tree should not be applied
			assert.equal(schematized.flexTree.content, undefined);
		});

		// TODO: ensure unhydrated initialTree input is correctly hydrated.
		it.skip("unhydrated tree input", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
			const sb = new SchemaFactory("test-factory");
			class Foo extends sb.object("Foo", {}) {}

			const unhydratedInitialTree = new Foo({});
			const view = tree.schematize(new TreeConfiguration(Foo, () => unhydratedInitialTree));
			assert(view.root === unhydratedInitialTree);
		});
	});

	describe("requireSchema", () => {
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
		});
		const schemaEmpty = new SchemaBuilderInternal({
			scope: "com.fluidframework.test",
			lint: { rejectEmpty: false, rejectForbidden: false },
		}).intoSchema(TreeFieldSchema.empty);

		function updateSchema(tree: SharedTree, schema: FlexTreeSchema): void {
			tree.checkout.updateSchema(intoStoredSchema(schema));
			// Workaround to trigger for schema update batching kludge in afterSchemaChanges
			tree.checkout.events.emit("afterBatch");
		}

		it("empty", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			) as SharedTree;
			const view = assertSchema(tree, schemaEmpty);
			assert.deepEqual([...view.flexTree.boxedIterator()], []);
		});

		it("differing schema errors and schema change callback", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"the tree",
			) as SharedTree;
			const builder = new SchemaBuilder({ scope: "test" });
			const schemaGeneralized = builder.intoSchema(builder.optional(Any));
			{
				const view = tree.requireSchema(schemaGeneralized, () => assert.fail());
				assert.equal(view, undefined);
			}

			const log: string[] = [];
			{
				const view = tree.requireSchema(schemaEmpty, () => log.push("empty"));
				assert(view !== undefined);
			}
			assert.deepEqual(log, []);
			updateSchema(tree, schemaGeneralized);

			assert.deepEqual(log, ["empty"]);

			{
				const view = tree.requireSchema(schemaGeneralized, () =>
					// TypeScript's type narrowing turned "log" into never[] here since it assumes methods never modify anything, so we have to cast it back to a string[]:
					(log as string[]).push("general"),
				);
				assert(view !== undefined);
			}
			assert.deepEqual(log, ["empty"]);
			updateSchema(tree, schemaEmpty);
			assert.deepEqual(log, ["empty", "general"]);
		});
	});

	it("handle in op", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const field = provider.trees[0].editor.optionalField({
			parent: undefined,
			field: rootFieldKey,
		});
		field.set(
			cursorForJsonableTreeNode({ type: leaf.handle.name, value: provider.trees[0].handle }),
			true,
		);
	});

	it("flex-tree-end-to-end", () => {
		const builder = new SchemaBuilder({ scope: "e2e" });
		const schema = builder.intoSchema(leaf.number);
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
		});
		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"the tree",
		);
		const view = sharedTree.schematizeInternal({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: 1,
			schema,
		});
		const root = view.flexTree;
		const leafNode = root.boxedContent;
		assert.equal(leafNode.value, 1);
		root.content = 2;
		assert(leafNode.treeStatus() !== TreeStatus.InDocument);
		assert.equal(root.content, 2);
	});

	it("contentSnapshot", () => {
		const factory = new SharedTreeFactory();
		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"the tree",
		);
		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, []);
			expectSchemaEqual(snapshot.schema, {
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
		}
		sharedTree.schematizeInternal({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: ["x"],
			schema: stringSequenceRootSchema,
		});
		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, [{ type: leaf.string.name, value: "x" }]);
			expectSchemaEqual(snapshot.schema, intoStoredSchema(stringSequenceRootSchema));
		}
	});

	it("can be connected to another tree", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const value = "42";

		// Apply an edit to the first tree which inserts a node with a value
		const view1 = provider.trees[0].schematizeInternal({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [value],
		});

		// Ensure that the first tree has the state we expect
		assert.deepEqual([...view1.flexTree], [value]);
		expectSchemaEqual(
			provider.trees[0].storedSchema,
			intoStoredSchema(stringSequenceRootSchema),
		);
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
		provider.trees[0].schematizeInternal({
			schema: jsonSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [value],
		});
		await provider.summarize();
		await provider.ensureSynchronized();
		const loadingTree = await provider.createTree();
		validateTreeContent(loadingTree.checkout, {
			schema: jsonSequenceRootSchema,
			initialTree: [value],
		});
	});

	function validateSchemaStringType(
		summaryTree: ISummaryTree,
		treeId: string,
		summaryType: SummaryType,
	): void {
		assert(
			summaryTree.tree[".channels"].type === SummaryType.Tree,
			"Runtime summary tree not created for blob dds test",
		);
		const dataObjectTree = summaryTree.tree[".channels"].tree.default;
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

				const b = new SchemaBuilder({ scope: "0x4a6 repro" });
				const node = b.objectRecursive("test node", {
					child: TreeFieldSchema.createUnsafe(FieldKinds.optional, [
						() => node,
						leaf.number,
					]),
				});
				const schema = b.intoSchema(b.optional(node));

				const config = {
					schema,
					initialTree: undefined,
					allowedSchemaModifications: AllowedUpdateType.None,
				} satisfies InitializeAndSchematizeConfiguration;
				const view1 = tree1.schematizeInternal(config);
				const editable1 = view1.flexTree;

				editable1.content = { [typeNameSymbol]: node.name, child: undefined };
				containerRuntimeFactory.processAllMessages();

				const tree2 = await factory.load(
					dataStoreRuntime2,
					"B",
					{
						deltaConnection: dataStoreRuntime2.createDeltaConnection(),
						objectStorage: MockStorage.createFromSummary(
							(await tree1.summarize()).summary,
						),
					},
					factory.attributes,
				);

				containerRuntimeFactory.processAllMessages();
				const incrementalSummaryContext = {
					summarySequenceNumber: dataStoreRuntime1.deltaManager.lastSequenceNumber,

					latestSummarySequenceNumber: dataStoreRuntime1.deltaManager.lastSequenceNumber,

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
				const tree1 = provider.trees[0];
				tree1.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));

				await provider.ensureSynchronized();
				await provider.summarize();

				const view1 = assertSchema(tree1, stringSequenceRootSchema);
				view1.flexTree.insertAt(0, ["A"]);

				await provider.ensureSynchronized();
				const { summaryTree } = await provider.summarize();
				validateSchemaStringType(summaryTree, provider.trees[0].id, SummaryType.Handle);
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
				const tree1 = provider.trees[0];
				tree1.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));
				await provider.ensureSynchronized();
				await provider.summarize();

				const view1 = assertSchema(tree1, stringSequenceRootSchema);
				view1.flexTree.insertAt(0, ["A"]);

				await provider.ensureSynchronized();
				validateSchemaStringType(
					(await provider.summarize()).summaryTree,
					provider.trees[0].id,
					SummaryType.Handle,
				);

				tree1.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));
				await provider.ensureSynchronized();
				validateSchemaStringType(
					(await provider.summarize()).summaryTree,
					provider.trees[0].id,
					SummaryType.Blob,
				);
			});
		});
	});

	it("can process ops after loading from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const tree2 = await provider.createTree();
		const tree3 = await provider.createTree();

		const [container1, container2, container3] = provider.containers;

		const tree1 = provider.trees[0].schematizeInternal({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: ["Z", "A", "C"],
		});

		await provider.ensureSynchronized();

		const view1 = tree1.flexTree;
		const view2 = assertSchema(tree2, stringSequenceRootSchema).flexTree;
		const view3 = assertSchema(tree3, stringSequenceRootSchema).flexTree;

		// Stop the processing of incoming changes on tree3 so that it does not learn about the deletion of Z
		await provider.opProcessingController.pauseProcessing(container3);

		// Remove Z
		view2.removeAt(0);

		// Ensure tree2 has a chance to send deletion of Z
		await provider.opProcessingController.processOutgoing(container2);

		// Ensure tree1 has a chance to receive the deletion of Z before putting out a summary
		await provider.opProcessingController.processIncoming(container1);
		assert.deepEqual([...view1], ["A", "C"]);

		// Have tree1 make a summary
		// Summarized state: A C
		await provider.summarize();

		// Insert B between A and C (without knowing of Z being removed)
		view3.insertAt(2, ["B"]);

		// Ensure the insertion of B is sent for processing by tree3 before tree3 receives the deletion of Z
		await provider.opProcessingController.processOutgoing(container3);

		// Allow tree3 to receive further changes (i.e., the deletion of Z)
		provider.opProcessingController.resumeProcessing(container3);

		// Ensure all trees are now caught up
		await provider.ensureSynchronized();

		// Load the last summary (state: "AC") and process the deletion of Z and insertion of B
		const tree4 = assertSchema(await provider.createTree(), stringSequenceRootSchema);

		// Ensure tree4 has a chance to process trailing ops.
		await provider.ensureSynchronized();

		// Trees 1 through 3 should get the correct end state (ABC) whether we include EditManager data
		// in summaries or not.
		const expectedValues = ["A", "B", "C"];
		assert.deepEqual([...view1], expectedValues);
		assert.deepEqual([...view2], expectedValues);
		assert.deepEqual([...view3], expectedValues);
		// tree4 should only get the correct end state if it was able to get the adequate
		// EditManager state from the summary. Specifically, in order to correctly rebase the insert
		// of B, tree4 needs to have a local copy of the edit that removed Z, so it can
		// rebase the insertion of  B over that edit.
		// Without that, it will interpret the insertion of B based on the current state, yielding
		// the order ACB.
		assert.deepEqual([...tree4.flexTree], expectedValues);
	});

	it("can load a summary from a tree and receive edits of the new state", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;

		summarizingTree.schematizeInternal({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: ["a", "b", "c"],
		});

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = await provider.createTree();

		summarizingTree.editor
			.sequenceField({
				field: rootFieldKey,
				parent: undefined,
			})
			.remove(0, 1);

		await provider.ensureSynchronized();

		validateTreeContent(loadingTree.checkout, {
			schema: stringSequenceRootSchema,
			initialTree: ["b", "c"],
		});
	});

	it("can load a summary from a tree and receive edits that require repair data", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;

		summarizingTree.schematizeInternal({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: ["a", "b", "c"],
		});

		const { undoStack, unsubscribe } = createTestUndoRedoStacks(
			summarizingTree.checkout.events,
		);

		summarizingTree.editor
			.sequenceField({ parent: undefined, field: rootFieldKey })
			.remove(0, 1);

		validateTreeContent(summarizingTree.checkout, {
			schema: stringSequenceRootSchema,
			initialTree: ["b", "c"],
		});

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = await provider.createTree();

		const revertible = undoStack.pop();
		assert(revertible !== undefined, "expected undo stack to have an entry");
		revertible.revert();

		validateTreeContent(summarizingTree.checkout, {
			schema: stringSequenceRootSchema,
			initialTree: ["a", "b", "c"],
		});

		await provider.ensureSynchronized();

		validateTreeContent(loadingTree.checkout, {
			schema: stringSequenceRootSchema,
			initialTree: ["a", "b", "c"],
		});
		unsubscribe();
	});

	it("can summarize local edits in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			const view = tree.schematizeInternal(emptyStringSequenceConfig);
			view.flexTree.insertAtStart(["A"]);
			view.flexTree.insertAtEnd(["C"]);
			assert.deepEqual([...view.flexTree], ["A", "C"]);
			view[disposeSymbol]();
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual([...tree1.flexTree], ["A", "C"]);
		await provider.ensureSynchronized();
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual([...tree2.flexTree], ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.flexTree.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual([...tree1.flexTree], ["A", "B", "C"]);
		assert.deepEqual([...tree2.flexTree], ["A", "B", "C"]);
	});

	it("can tolerate local edits submitted as part of a transaction in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			// Schematize uses a transaction as well
			const view = tree.schematizeInternal(emptyStringSequenceConfig);
			view.checkout.transaction.start();
			view.flexTree.insertAtStart(["A"]);
			view.flexTree.insertAt(1, ["C"]);
			view.checkout.transaction.commit();
			assert.deepEqual([...view.flexTree], ["A", "C"]);
			view[disposeSymbol]();
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual([...tree1.flexTree], ["A", "C"]);
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual([...tree2.flexTree], ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.flexTree.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual([...tree1.flexTree], ["A", "B", "C"]);
		assert.deepEqual([...tree2.flexTree], ["A", "B", "C"]);
	});

	// AB#5745: Enable this test once it passes.
	// TODO: above mentioned task is done, but this still fails. Fix it.
	it.skip("can tolerate incomplete transactions when attaching", async () => {
		const onCreate = (tree: SharedTree) => {
			tree.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));
			tree.checkout.transaction.start();
			const view = assertSchema(tree, stringSequenceRootSchema).flexTree;
			view.insertAtStart(["A"]);
			view.insertAt(1, ["C"]);
			assert.deepEqual([...view], ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual([...tree1.flexTree], ["A", "C"]);
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		tree1.checkout.transaction.commit();
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual(tree2, []);

		await provider.ensureSynchronized();
		assert.deepEqual([...tree1.flexTree], ["A", "C"]);
		assert.deepEqual([...tree2.flexTree], ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.flexTree.insertAt(1, ["B"]);
		await provider.ensureSynchronized();
		assert.deepEqual([...tree1.flexTree], ["A", "B", "C"]);
		assert.deepEqual([...tree2.flexTree], ["A", "B", "C"]);
	});

	it("has bounded memory growth in EditManager", () => {
		const provider = new TestTreeProviderLite(2);
		provider.trees[0].schematizeInternal(emptyStringSequenceConfig)[disposeSymbol]();
		provider.processMessages();

		const [tree1, tree2] = provider.trees.map(
			(t) => assertSchema(t, stringSequenceRootSchema).flexTree,
		);

		// Make some arbitrary number of edits
		for (let i = 0; i < 10; ++i) {
			tree1.insertAtStart([""]);
		}

		provider.processMessages();

		// These two edit will have ref numbers that correspond to the last of the above edits
		tree1.insertAtStart([""]);
		tree2.insertAtStart([""]);

		// This synchronization point should ensure that both trees see the edits with the higher ref numbers.
		provider.processMessages();

		// It's not clear if we'll ever want to expose the EditManager to ISharedTree consumers or
		// if we'll ever expose some memory stats in which the trunk length would be included.
		// If we do then this test should be updated to use that code path.
		const t1 = provider.trees[0] as unknown as { editManager?: EditManager<any, any, any> };
		const t2 = provider.trees[1] as unknown as { editManager?: EditManager<any, any, any> };
		assert(
			t1.editManager !== undefined && t2.editManager !== undefined,
			"EditManager has moved. This test must be updated.",
		);
		assert(t1.editManager.getTrunkChanges().length < 10);
		assert(t2.editManager.getTrunkChanges().length < 10);
	});

	it("can process changes while detached", async () => {
		const onCreate = (t: ISharedTree) => {
			const view = t.schematizeInternal(emptyStringSequenceConfig);
			view.flexTree.insertAtStart(["B"]);
			view.flexTree.insertAtStart(["A"]);
			assert.deepEqual([...view.flexTree], ["A", "B"]);
			view[disposeSymbol]();
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const tree = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual([...tree.flexTree], ["A", "B"]);
	});

	describe("Undo and redo", () => {
		it("the insert of a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.checkout.events,
			);
			provider.processMessages();
			const tree2 = provider.trees[1].schematizeInternal(emptyStringSequenceConfig);
			provider.processMessages();

			// Insert node
			tree1.flexTree.insertAtStart([value]);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...tree2.flexTree], [value]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], []);
			assert.deepEqual([...tree2.flexTree], []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], [value]);
			assert.deepEqual([...tree2.flexTree], [value]);
			unsubscribe();
		});

		it("inserts of multiple nodes in a sequence field", () => {
			const value = "A";
			const value2 = "B";
			const value3 = "C";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.checkout.events,
			);
			provider.processMessages();
			const tree2 = provider.trees[1].schematizeInternal(emptyStringSequenceConfig);
			provider.processMessages();

			// Insert node
			tree1.flexTree.insertAtStart(value3);
			tree1.flexTree.insertAtStart(value2);
			tree1.flexTree.insertAtStart(value);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...tree1.flexTree], [value, value2, value3]);
			assert.deepEqual([...tree2.flexTree], [value, value2, value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], [value2, value3]);
			assert.deepEqual([...tree2.flexTree], [value2, value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], [value3]);
			assert.deepEqual([...tree2.flexTree], [value3]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], []);
			assert.deepEqual([...tree2.flexTree], []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual([...tree1.flexTree], [value3]);
			assert.deepEqual([...tree2.flexTree], [value3]);
			unsubscribe();
		});

		it("rebased edits", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematizeInternal(content);

			const {
				undoStack: undoStack1,
				redoStack: redoStack1,
				unsubscribe: unsubscribe1,
			} = createTestUndoRedoStacks(tree1.checkout.events);

			provider.processMessages();
			const tree2 =
				provider.trees[1].requireSchema(content.schema, () => fail("schema changed")) ??
				fail("schematize failed");
			const {
				undoStack: undoStack2,
				redoStack: redoStack2,
				unsubscribe: unsubscribe2,
			} = createTestUndoRedoStacks(tree2.checkout.events);

			// Validate insertion
			validateTreeContent(tree2.checkout, content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;
			// Insert nodes on both trees
			root1.insertAt(1, ["x"]);
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, ["y"]);
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			undoStack1.pop()?.revert();
			assert.deepEqual([...root1], ["A", "B", "C", "y", "D"]);

			undoStack2.pop()?.revert();
			assert.deepEqual([...root2], ["A", "x", "B", "C", "D"]);

			provider.processMessages();
			validateTreeContent(tree1.checkout, content);
			validateTreeContent(tree2.checkout, content);

			// Insert additional node at the beginning to require rebasing
			root1.insertAt(0, ["0"]);
			assert.deepEqual([...root1], ["0", "A", "B", "C", "D"]);

			const expectedAfterRedo = ["0", "A", "x", "B", "C", "y", "D"];
			// Redo node insertion on both trees
			redoStack1.pop()?.revert();
			assert.deepEqual([...root1], ["0", "A", "x", "B", "C", "D"]);

			redoStack2.pop()?.revert();
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D"]);

			provider.processMessages();
			assert.deepEqual([...tree1.flexTree], expectedAfterRedo);
			assert.deepEqual([...tree2.flexTree], expectedAfterRedo);
			unsubscribe1();
			unsubscribe2();
		});

		/**
		 * the collab window includes all sequenced edits after the minimum sequence number
		 * these tests test that undoing edits behind (i.e., with a seq# less than) the minimum sequence number works
		 */
		it("refresher for repair data out of collab window", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematizeInternal(content);

			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(
				tree1.checkout.events,
			);

			provider.processMessages();
			const tree2 = provider.trees[1].schematizeInternal(content);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;

			// remove in first tree
			root1.removeAt(0);

			provider.processMessages();
			const removeSequenceNumber = provider.sequenceNumber;
			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// send edits to move the collab window up
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();
			root2.insertAt(3, ["y"]);
			provider.processMessages();
			root1.removeAt(3);
			provider.processMessages();

			assert.deepEqual([...root1], ["B", "C", "D"]);
			assert.deepEqual([...root2], ["B", "C", "D"]);

			// ensure the remove is out of the collab window
			assert(removeSequenceNumber < provider.minimumSequenceNumber);
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
			const sb = new SchemaBuilder({ scope: "shared tree undo tests" });
			const schema = sb.intoSchema(sb.list(sb.list(sb.string)));

			for (const scenario of ["restore then change", "change then restore"]) {
				it(`with the ${scenario} sequenced`, () => {
					const provider = new TestTreeProviderLite(2);
					const content = {
						schema,
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: [["a"]],
					} satisfies InitializeAndSchematizeConfiguration;
					const tree1 = provider.trees[0].schematizeInternal(content);
					const { undoStack: undoStack1, unsubscribe: unsubscribe1 } =
						createTestUndoRedoStacks(tree1.checkout.events);
					const tree2 = provider.trees[1].schematizeInternal(content);
					const { undoStack: undoStack2, unsubscribe: unsubscribe2 } =
						createTestUndoRedoStacks(tree2.checkout.events);

					provider.processMessages();

					// Validate insertion
					validateTreeContent(tree2.checkout, content);

					// edit subtree
					const outerList = tree2.flexTree.content.content;
					const innerList = (outerList.at(0) ?? assert.fail()).content;
					innerList.insertAtEnd("b");
					provider.processMessages();
					assert.deepEqual(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						[...tree1.flexTree.content.content.at(0)!.content],
						["a", "b"],
					);
					assert.deepEqual([...innerList], ["a", "b"]);

					// remove subtree
					tree1.flexTree.content.content.removeAt(0);
					provider.processMessages();
					assert.deepEqual([...tree1.flexTree.content.content], []);
					assert.deepEqual([...tree2.flexTree.content.content], []);

					if (scenario === "restore then change") {
						undoStack1.pop()?.revert();
						undoStack2.pop()?.revert();
					} else {
						undoStack2.pop()?.revert();
						undoStack1.pop()?.revert();
					}

					provider.processMessages();
					// check the undo happened
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					assert.deepEqual([...tree1.flexTree.content.content.at(0)!.content], ["a"]);
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					assert.deepEqual([...tree2.flexTree.content.content.at(0)!.content], ["a"]);

					unsubscribe1();
					unsubscribe2();
				});
			}
		});
	});

	// TODO: many of these events tests should be tests of SharedTreeView instead.
	describe("Events", () => {
		const builder = new SchemaBuilder({ scope: "Events test schema" });
		const rootTreeNodeSchema = builder.object("root", {
			x: builder.number,
		});
		const schema = builder.intoSchema(builder.optional(Any));

		it("triggers revertible events for local changes", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
			provider.processMessages();
			const tree2 = assertSchema(provider.trees[1], stringSequenceRootSchema);

			const {
				undoStack: undoStack1,
				redoStack: redoStack1,
				unsubscribe: unsubscribe1,
			} = createTestUndoRedoStacks(tree1.checkout.events);
			const {
				undoStack: undoStack2,
				redoStack: redoStack2,
				unsubscribe: unsubscribe2,
			} = createTestUndoRedoStacks(tree2.checkout.events);

			// Insert node
			tree1.flexTree.insertAtStart([value]);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual([...tree2.flexTree], [value]);
			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 0);

			undoStack1.pop()?.revert();
			provider.processMessages();

			// Insert node
			tree2.flexTree.insertAtStart(["43"]);
			provider.processMessages();

			assert.equal(undoStack1.length, 0);
			assert.equal(redoStack1.length, 1);
			assert.equal(undoStack2.length, 1);
			assert.equal(redoStack2.length, 0);

			redoStack1.pop()?.revert();
			provider.processMessages();

			assert.equal(undoStack1.length, 1);
			assert.equal(redoStack1.length, 0);
			assert.equal(undoStack2.length, 1);
			assert.equal(redoStack2.length, 0);

			unsubscribe1();
			unsubscribe2();
		});

		it("doesn't trigger a revertible event for rebases", () => {
			const provider = new TestTreeProviderLite(2);
			// Initialize the tree
			const tree1 = provider.trees[0].schematizeInternal({
				initialTree: ["A", "B", "C", "D"],
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			provider.processMessages();
			const tree2 =
				provider.trees[1].requireSchema(stringSequenceRootSchema, () =>
					fail("schema changed"),
				) ?? fail("invalid schema");

			// Validate initialization
			validateViewConsistency(tree1.checkout, tree2.checkout);

			const { undoStack: undoStack1, unsubscribe: unsubscribe1 } = createTestUndoRedoStacks(
				tree1.checkout.events,
			);
			const { undoStack: undoStack2, unsubscribe: unsubscribe2 } = createTestUndoRedoStacks(
				tree2.checkout.events,
			);

			const root1 = tree1.flexTree;
			const root2 = tree2.flexTree;
			// Insert a node on tree 2
			root2.insertAt(4, ["z"]);
			assert.deepEqual([...root2], ["A", "B", "C", "D", "z"]);

			// Insert nodes on both trees
			root1.insertAt(1, ["x"]);
			assert.deepEqual([...root1], ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, ["y"]);
			assert.deepEqual([...root2], ["A", "B", "C", "y", "D", "z"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 2);

			unsubscribe1();
			unsubscribe2();
		});
	});

	// TODO:
	// These tests should either be tests of SharedTreeView, EditManager, or the relevant field kind's rebase function.
	// Keeping a couple integration tests for rebase at this level might be ok (for example schema vs other edits), but that should be minimal,
	// and those tests should setup proper schema, and use the high levels editing APIs (editable tree) if they are serving as integration tests of SharedTree,
	describe("Rebasing", () => {
		it("rebases stashed ops with prior state present", async () => {
			const provider = await TestTreeProvider.create(2);
			const config = {
				initialTree: ["a"],
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			};
			const view1 = provider.trees[0].schematizeInternal(config);
			await provider.ensureSynchronized();

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = view1;
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			pausedTree.flexTree.insertAt(1, ["b"]);
			pausedTree.flexTree.insertAt(2, ["c"]);
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const otherLoadedTree = assertSchema(
				provider.trees[1],
				stringSequenceRootSchema,
			).flexTree;
			otherLoadedTree.insertAtStart(["d"]);
			await provider.ensureSynchronized();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = (await loadedContainer.getEntryPoint()) as ITestFluidObject;
			const tree = assertSchema(
				await dataStore.getSharedObject<ISharedTree>("TestSharedTree"),
				stringSequenceRootSchema,
			);
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();
			assert.deepEqual([...tree.flexTree], ["d", "a", "b", "c"]);
			assert.deepEqual([...otherLoadedTree], ["d", "a", "b", "c"]);
		});
	});

	describe("Anchors", () => {
		it("Anchors can be created and dereferenced", () => {
			const provider = new TestTreeProviderLite();

			provider.trees[0].schematizeInternal({
				schema: numberSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: [0, 1, 2],
			});

			const tree = provider.trees[0].checkout;

			const cursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, cursor);

			cursor.enterNode(0);
			cursor.seekNodes(1);
			const anchor = cursor.buildAnchor();
			cursor.free();
			const childPath = tree.locate(anchor);
			const expected: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 1,
			};
			assert(compareUpPaths(childPath, expected));
		});
	});

	it("don't send ops before committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.checkout.transaction.start();
		tree1.flexTree.insertAtStart(["x"]);
		provider.processMessages();
		assert.equal(opsReceived, 0);
		tree1.checkout.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual([...assertSchema(tree2, stringSequenceRootSchema).flexTree], ["x"]);
	});

	it("send only one op after committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.checkout.transaction.start();
		tree1.flexTree.insertAtStart(["B"]);
		tree1.flexTree.insertAtStart(["A"]);
		tree1.checkout.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual([...assertSchema(tree2, stringSequenceRootSchema).flexTree], ["A", "B"]);
	});

	it("do not send an op after committing if nested", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematizeInternal(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.checkout.transaction.start();
		tree1.checkout.transaction.start();
		tree1.flexTree.insertAtStart("A");
		tree1.checkout.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 0);
		const view2 = assertSchema(tree2, stringSequenceRootSchema).flexTree;
		assert.deepEqual([...view2], []);
		tree1.flexTree.insertAtEnd(["B"]);
		tree1.checkout.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual([...view2], ["A", "B"]);
	});

	it("process changes while detached", async () => {
		const onCreate = (parentTree: SharedTree) => {
			const parent = parentTree.schematizeInternal({
				initialTree: ["A"],
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			parent.checkout.transaction.start();
			parent.flexTree.insertAtStart(["B"]);
			parent.checkout.transaction.commit();
			const child = parent.fork();
			child.checkout.transaction.start();
			child.flexTree.insertAtStart(["C"]);
			child.checkout.transaction.commit();
			parent.checkout.merge(child.checkout);
			child[disposeSymbol]();
			assert.deepEqual([...parent.flexTree], ["C", "B", "A"]);
			parent[disposeSymbol]();
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const [tree] = provider.trees;
		assert.deepEqual(
			[...assertSchema(tree, stringSequenceRootSchema).flexTree],
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
			tree1.editor.sequenceField({ parent: undefined, field: rootFieldKey }).remove(0, 99),
		);

		provider.processMessages();
	});

	describe("Schema changes", () => {
		it("handles two trees schematizing identically at the same time", async () => {
			const provider = await TestTreeProvider.create(2, SummarizeType.disabled);
			const value1 = "42";
			const value2 = "42";

			const view1 = provider.trees[0].schematizeInternal({
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: [value1],
			});

			provider.trees[1].schematizeInternal({
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: [value2],
			});

			await provider.ensureSynchronized();
			assert.deepEqual([...view1.flexTree], [value1]);
			expectSchemaEqual(
				provider.trees[1].storedSchema,
				intoStoredSchema(stringSequenceRootSchema),
			);
			validateTreeConsistency(provider.trees[0], provider.trees[1]);
		});

		it("can be undone at the tip", async () => {
			const provider = await TestTreeProvider.create(2, SummarizeType.disabled);

			const tree = provider.trees[0];
			const { undoStack } = createTestUndoRedoStacks(tree.checkout.events);

			tree.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));
			expectSchemaEqual(tree.storedSchema, intoStoredSchema(stringSequenceRootSchema));

			tree.checkout.updateSchema(intoStoredSchema(jsonSequenceRootSchema));
			expectSchemaEqual(tree.storedSchema, intoStoredSchema(jsonSequenceRootSchema));

			const revertible = undoStack.pop();
			revertible?.revert();

			expectSchemaEqual(tree.storedSchema, intoStoredSchema(stringSequenceRootSchema));
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
			pausedTree.checkout.updateSchema(intoStoredSchema(stringSequenceRootSchema));
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = (await loadedContainer.getEntryPoint()) as ITestFluidObject;
			const tree = await dataStore.getSharedObject<ISharedTree>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();

			const otherLoadedTree = provider.trees[1];
			expectSchemaEqual(
				tree.contentSnapshot().schema,
				intoStoredSchema(stringSequenceRootSchema),
			);
			expectSchemaEqual(
				otherLoadedTree.storedSchema,
				intoStoredSchema(stringSequenceRootSchema),
			);
		});
	});

	describe("Creates a SharedTree using specific ForestType", () => {
		it("unspecified ForestType uses ObjectForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					jsonValidator: typeboxValidator,
				}),
			);
			assert.equal(trees[0].checkout.forest instanceof ObjectForest, true);
		});

		it("ForestType.Reference uses ObjectForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestType.Reference,
				}),
			);
			assert.equal(trees[0].checkout.forest instanceof ObjectForest, true);
		});

		it("ForestType.Optimized uses ChunkedForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestType.Optimized,
				}),
			);
			assert.equal(trees[0].checkout.forest instanceof ChunkedForest, true);
		});
	});
});

function assertSchema<TRoot extends TreeFieldSchema>(
	tree: ISharedTree,
	schema: FlexTreeSchema<TRoot>,
): FlexTreeView<TRoot> {
	return tree.requireSchema(schema, () => assert.fail()) ?? assert.fail();
}
