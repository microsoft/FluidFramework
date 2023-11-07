/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { ITestFluidObject, waitForContainerConnection } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IContainerExperimental } from "@fluidframework/container-loader";
import {
	singleTextCursor,
	makeSchemaCodec,
	jsonableTreeFromCursor,
	Any,
	TreeStatus,
	TreeFieldSchema,
	SchemaBuilderInternal,
	boxedIterator,
	TreeSchema,
} from "../../feature-libraries";
import { brand, fail, TransactionResult } from "../../util";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
	createTestUndoRedoStacks,
	emptyStringSequenceConfig,
	expectSchemaEqual,
	initializeTestTree,
	jsonSequenceRootSchema,
	numberSequenceRootSchema,
	stringSequenceRootSchema,
	validateTree,
	validateTreeConsistency,
	validateTreeContent,
	validateViewConsistency,
	viewWithContent,
} from "../utils";
import {
	ForestType,
	ISharedTree,
	ISharedTreeBranchView,
	ISharedTreeView,
	ISharedTreeView2,
	InitializeAndSchematizeConfiguration,
	SharedTree,
	SharedTreeFactory,
	TreeContent,
	runSynchronous,
} from "../../shared-tree";
import {
	compareUpPaths,
	FieldKey,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
	UpPath,
	moveToDetachedField,
	TreeStoredSchema,
	AllowedUpdateType,
	storedEmptyFieldSchema,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { EditManager } from "../../shared-tree-core";
import { jsonSchema, leaf, SchemaBuilder } from "../../domains";
import { noopValidator } from "../../codec";

const schemaCodec = makeSchemaCodec({ jsonValidator: typeboxValidator });

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

		const builderGeneralized = new SchemaBuilder({
			scope: "test",
			name: "Schematize Tree Tests Generalized",
		});

		const schemaGeneralized = builderGeneralized.intoSchema(SchemaBuilder.optional(Any));

		// TODO: concurrent use of schematize should not double initialize. Should use constraints so second run conflicts.
		it.skip("Concurrent Schematize", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["x"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematize(content);
			provider.trees[1].schematize(content);
			provider.processMessages();

			assert.deepEqual(tree1.editableTree.asArray, ["x"]);
		});

		it("initialize tree", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
			assert.equal(tree.contentSnapshot().schema.rootFieldSchema, storedEmptyFieldSchema);

			const view = tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
			assert.equal(view.root, 10);
		});

		it("noop upgrade", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
			tree.storedSchema.update(schema);

			// No op upgrade with AllowedUpdateType.None does not error
			const schematized = tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: 10,
				schema,
			});
			// And does not add initial tree:
			assert.equal(schematized.root, undefined);
		});

		it("incompatible upgrade errors", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
			tree.storedSchema.update(schemaGeneralized);
			assert.throws(() => {
				tree.schematize({
					allowedSchemaModifications: AllowedUpdateType.None,
					initialTree: 5,
					schema,
				});
			});
		});

		it("upgrade schema", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
			tree.storedSchema.update(schema);
			const schematized = tree.schematize({
				allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
				initialTree: 5,
				schema: schemaGeneralized,
			});
			// Initial tree should not be applied
			assert.equal(schematized.root, undefined);
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

		function updateSchema(tree: SharedTree, schema: TreeSchema): void {
			tree.storedSchema.update(schema);
			// Workaround to trigger for schema update batching kludge in afterSchemaChanges
			tree.view.events.emit("afterBatch");
		}

		it("empty", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
			const view = assertSchema(tree, schemaEmpty);
			assert.deepEqual([...view.editableTree[boxedIterator]()], []);
		});

		it("differing schema errors and schema change callback", () => {
			const tree = factory.create(new MockFluidDataStoreRuntime(), "the tree") as SharedTree;
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
			singleTextCursor({ type: leaf.handle.name, value: provider.trees[0].handle }),
			true,
		);
	});

	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder({ scope: "e2e" });
		const schema = builder.intoSchema(leaf.number);
		const factory = new SharedTreeFactory({
			jsonValidator: typeboxValidator,
			forest: ForestType.Reference,
		});
		const sharedTree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		const view = sharedTree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: 1,
			schema,
		});
		const root = view.editableTree;
		const leafNode = root.boxedContent;
		assert.equal(leafNode.value, 1);
		root.content = 2;
		assert(leafNode.treeStatus() !== TreeStatus.InDocument);
		assert.equal(root.content, 2);
	});

	it("contentSnapshot", () => {
		const factory = new SharedTreeFactory();
		const sharedTree = factory.create(new MockFluidDataStoreRuntime(), "the tree");
		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, []);
			expectSchemaEqual(snapshot.schema, {
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map(),
			});
		}
		sharedTree.schematize({
			allowedSchemaModifications: AllowedUpdateType.SchemaCompatible,
			initialTree: ["x"],
			schema: stringSequenceRootSchema,
		});
		{
			const snapshot = sharedTree.contentSnapshot();
			assert.deepEqual(snapshot.tree, [{ type: leaf.string.name, value: "x" }]);
			expectSchemaEqual(snapshot.schema, stringSequenceRootSchema);
		}
	});

	it("can be connected to another tree", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const value = "42";
		const expectedSchema = schemaCodec.encode(stringSequenceRootSchema);

		// Apply an edit to the first tree which inserts a node with a value
		const view1 = provider.trees[0].schematize({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [value],
		});

		// Ensure that the first tree has the state we expect
		assert.deepEqual(view1.editableTree.asArray, [value]);
		assert.deepEqual(schemaCodec.encode(provider.trees[0].storedSchema), expectedSchema);
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
		const summarizingTree = provider.trees[0].schematize({
			schema: jsonSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [value],
		});
		await provider.summarize();
		await provider.ensureSynchronized();
		const loadingTree = await provider.createTree();
		validateTreeContent(loadingTree.view, {
			schema: jsonSequenceRootSchema,
			initialTree: [value],
		});
	});

	it("can process ops after loading from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const tree2 = await provider.createTree();
		const tree3 = await provider.createTree();

		const [container1, container2, container3] = provider.containers;

		const tree1 = provider.trees[0].schematize({
			schema: stringSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: ["Z", "A", "C"],
		});

		await provider.ensureSynchronized();

		const view1 = tree1.editableTree;
		const view2 = assertSchema(tree2, stringSequenceRootSchema).editableTree;
		const view3 = assertSchema(tree3, stringSequenceRootSchema).editableTree;

		// Stop the processing of incoming changes on tree3 so that it does not learn about the deletion of Z
		await provider.opProcessingController.pauseProcessing(container3);

		// Delete Z
		view2.removeAt(0);

		// Ensure tree2 has a chance to send deletion of Z
		await provider.opProcessingController.processOutgoing(container2);

		// Ensure tree1 has a chance to receive the deletion of Z before putting out a summary
		await provider.opProcessingController.processIncoming(container1);
		assert.deepEqual(view1.asArray, ["A", "C"]);

		// Have tree1 make a summary
		// Summarized state: A C
		await provider.summarize();

		// Insert B between A and C (without knowing of Z being deleted)
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
		assert.deepEqual(view1.asArray, expectedValues);
		assert.deepEqual(view2.asArray, expectedValues);
		assert.deepEqual(view3.asArray, expectedValues);
		// tree4 should only get the correct end state if it was able to get the adequate
		// EditManager state from the summary. Specifically, in order to correctly rebase the insert
		// of B, tree4 needs to have a local copy of the edit that deleted Z, so it can
		// rebase the insertion of  B over that edit.
		// Without that, it will interpret the insertion of B based on the current state, yielding
		// the order ACB.
		assert.deepEqual(tree4.editableTree.asArray, expectedValues);
	});

	it("can load a summary from a tree and receive edits of the new state", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;

		const initialState: JsonableTree = {
			type: brand("Node"),
			fields: {
				foo: [
					{ type: brand("Node"), value: "a" },
					{ type: brand("Node"), value: "b" },
					{ type: brand("Node"), value: "c" },
				],
			},
		};
		initializeTestTree(summarizingTree.view, initialState);

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = (await provider.createTree()).view;
		const fooField: FieldKey = brand("foo");

		runSynchronous(summarizingTree.view, () => {
			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			summarizingTree.editor
				.sequenceField({ parent: rootPath, field: fooField })
				.delete(0, 1);
		});

		await provider.ensureSynchronized();

		const cursor = loadingTree.forest.allocateCursor();
		moveToDetachedField(loadingTree.forest, cursor);
		assert.equal(cursor.firstNode(), true);
		cursor.enterField(fooField);
		assert.equal(cursor.firstNode(), true);
		// An error may occur earlier in the test but may be swallowed up. If so, this line will fail
		// due to the delete edit above not being able to be applied to loadingTree.
		assert.equal(cursor.value, "b");
		assert.equal(cursor.nextNode(), true);
		assert.equal(cursor.value, "c");
		assert.equal(cursor.nextNode(), false);
	});

	it("can load a summary from a tree and receive edits that require repair data", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;

		const initialState: JsonableTree = {
			type: brand("Node"),
			fields: {
				foo: [
					{ type: brand("Node"), value: "a" },
					{ type: brand("Node"), value: "b" },
					{ type: brand("Node"), value: "c" },
				],
			},
		};
		initializeTestTree(summarizingTree.view, initialState);

		const { undoStack, unsubscribe } = createTestUndoRedoStacks(summarizingTree.view);

		const fooField: FieldKey = brand("foo");
		runSynchronous(summarizingTree.view, () => {
			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			summarizingTree.editor
				.sequenceField({ parent: rootPath, field: fooField })
				.delete(0, 1);
		});

		const cursor = summarizingTree.view.forest.allocateCursor();
		moveToDetachedField(summarizingTree.view.forest, cursor);
		assert.equal(cursor.firstNode(), true);
		cursor.enterField(fooField);
		assert.equal(cursor.firstNode(), true);
		assert.equal(cursor.value, "b");
		cursor.free();

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = (await provider.createTree()).view;

		const revertible = undoStack.pop();
		assert(revertible !== undefined, "expected undo stack to have an entry");
		revertible.revert();

		const cursor2 = summarizingTree.view.forest.allocateCursor();
		moveToDetachedField(summarizingTree.view.forest, cursor2);
		assert.equal(cursor2.firstNode(), true);
		cursor2.enterField(fooField);
		assert.equal(cursor2.firstNode(), true);
		assert.equal(cursor2.value, "a");
		cursor2.free();

		await provider.ensureSynchronized();

		const cursor3 = loadingTree.forest.allocateCursor();
		moveToDetachedField(loadingTree.forest, cursor3);
		assert.equal(cursor3.firstNode(), true);
		cursor3.enterField(fooField);
		assert.equal(cursor3.firstNode(), true);
		// An error may occur earlier in the test but may be swallowed up. If so, this line will fail
		// due to the undo edit above not being able to be applied to loadingTree.
		assert.equal(cursor3.value, "a");
		assert.equal(cursor3.nextNode(), true);
		assert.equal(cursor3.value, "b");
		assert.equal(cursor3.nextNode(), true);
		assert.equal(cursor3.value, "c");
		assert.equal(cursor3.nextNode(), false);
		cursor3.free();
		unsubscribe();
	});

	it("can summarize local edits in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			const view = tree.schematize(emptyStringSequenceConfig).editableTree;
			view.insertAtStart(["A"]);
			view.insertAtEnd(["C"]);
			assert.deepEqual(view.asArray, ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual(tree1.editableTree.asArray, ["A", "C"]);
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual(tree2.editableTree.asArray, ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.editableTree.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual(tree1.editableTree.asArray, ["A", "B", "C"]);
		assert.deepEqual(tree2.editableTree.asArray, ["A", "B", "C"]);
	});

	it("can tolerate local edits submitted as part of a transaction in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			// Schematize uses a transaction as well
			const view = tree.schematize(emptyStringSequenceConfig);
			view.branch.transaction.start();
			view.editableTree.insertAtStart(["A"]);
			view.editableTree.insertAt(1, ["C"]);
			view.branch.transaction.commit();
			assert.deepEqual(view.editableTree.asArray, ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual(tree1.editableTree.asArray, ["A", "C"]);
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual(tree2.editableTree.asArray, ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.editableTree.insertAt(1, "B");
		await provider.ensureSynchronized();
		assert.deepEqual(tree1.editableTree.asArray, ["A", "B", "C"]);
		assert.deepEqual(tree2.editableTree.asArray, ["A", "B", "C"]);
	});

	// AB#5745: Enable this test once it passes.
	it.skip("can tolerate incomplete transactions when attaching", async () => {
		const onCreate = (tree: SharedTree) => {
			tree.storedSchema.update(stringSequenceRootSchema);
			tree.view.transaction.start();
			const view = assertSchema(tree, stringSequenceRootSchema).editableTree;
			view.insertAtStart(["A"]);
			view.insertAt(1, ["C"]);
			assert.deepEqual(view.asArray, ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual(tree1.editableTree.asArray, ["A", "C"]);
		const tree2 = assertSchema(await provider.createTree(), stringSequenceRootSchema);
		tree1.branch.transaction.commit();
		// Check that the joining tree was initialized with data from the attach summary
		assert.deepEqual(tree2, []);

		await provider.ensureSynchronized();
		assert.deepEqual(tree1.editableTree.asArray, ["A", "C"]);
		assert.deepEqual(tree2.editableTree.asArray, ["A", "C"]);

		// Check that further edits are interpreted properly
		tree1.editableTree.insertAt(1, ["B"]);
		await provider.ensureSynchronized();
		assert.deepEqual(tree1.editableTree.asArray, ["A", "B", "C"]);
		assert.deepEqual(tree2.editableTree.asArray, ["A", "B", "C"]);
	});

	it("has bounded memory growth in EditManager", () => {
		const provider = new TestTreeProviderLite(2);
		provider.trees[0].schematize(emptyStringSequenceConfig);
		provider.processMessages();

		const [tree1, tree2] = provider.trees.map(
			(t) => assertSchema(t, stringSequenceRootSchema).editableTree,
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
			const view = t.schematize(emptyStringSequenceConfig);
			view.editableTree.insertAtStart(["B"]);
			view.editableTree.insertAtStart(["A"]);
			assert.deepEqual(view.editableTree.asArray, ["A", "B"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const tree = assertSchema(provider.trees[0], stringSequenceRootSchema);
		assert.deepEqual(tree.editableTree.asArray, ["A", "B"]);
	});

	// TODO:
	// If these are testing collaboration and conflicts they should probably be EditManager tests.
	// If they are testing the editor API and that it creates the proper deltas, they should be at that level.
	// These tests currently mostly don't use the public facing editing API, so they probably shouldn't be in this file,
	// except for maybe some integration/end to end test which uses editable tree and collaboration.
	describe("Editing", () => {
		it("can insert and delete a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig).editableTree;
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyStringSequenceConfig).editableTree;
			provider.processMessages();

			// Insert node
			tree1.insertAtStart([value]);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual(tree2.asArray, [value]);

			// Delete node
			tree1.removeAt(0);

			provider.processMessages();

			assert.deepEqual(tree1.asArray, []);
			assert.deepEqual(tree2.asArray, []);
		});

		it("can handle competing deletes", () => {
			for (const index of [0, 1, 2, 3]) {
				const provider = new TestTreeProviderLite(4);
				const config = {
					schema: numberSequenceRootSchema,
					initialTree: [0, 1, 2, 3],
					allowedSchemaModifications: AllowedUpdateType.None,
				} satisfies InitializeAndSchematizeConfiguration;
				const tree1 = provider.trees[0].schematize(config);
				provider.processMessages();
				const tree2 = provider.trees[1].schematize(config);
				const tree3 = provider.trees[2].schematize(config);
				const tree4 = provider.trees[3].schematize(config);
				provider.processMessages();

				tree1.editableTree.removeAt(index);
				tree2.editableTree.removeAt(index);
				tree3.editableTree.removeAt(index);

				provider.processMessages();

				const expectedSequence = [0, 1, 2, 3];
				expectedSequence.splice(index, 1);
				assert.deepEqual(tree1.editableTree.asArray, expectedSequence);
				assert.deepEqual(tree2.editableTree.asArray, expectedSequence);
				assert.deepEqual(tree3.editableTree.asArray, expectedSequence);
				assert.deepEqual(tree4.editableTree.asArray, expectedSequence);
			}
		});

		it("can insert and delete a node in an optional field", () => {
			const value = 42;
			const provider = new TestTreeProviderLite(2);
			const schema = new SchemaBuilder({
				scope: "optional",
				libraries: [jsonSchema],
			}).intoSchema(SchemaBuilder.optional(leaf.number));
			const config = {
				schema,
				initialTree: value,
				allowedSchemaModifications: AllowedUpdateType.None,
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematize(config).editableTree;
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(config).editableTree;

			// Delete node
			tree1.content = undefined;
			provider.processMessages();
			assert.equal(tree1.content, undefined);
			assert.equal(tree2.content, undefined);

			// Set node
			tree1.content = 43;
			provider.processMessages();
			assert.equal(tree1.content, 43);
			assert.equal(tree2.content, 43);
		});

		function abortTransaction(branch: ISharedTreeView): void {
			const initialState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [
						{ type: brand("Number"), value: 0 },
						{ type: brand("Number"), value: 1 },
						{ type: brand("Number"), value: 2 },
					],
				},
			};
			initializeTestTree(branch, initialState);
			runSynchronous(branch, () => {
				const rootField = branch.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});
				const root0Path = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};
				const root1Path = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 1,
				};
				const foo0 = branch.editor.sequenceField({ parent: root0Path, field: fooKey });
				const foo1 = branch.editor.sequenceField({ parent: root1Path, field: fooKey });
				foo0.delete(1, 1);
				foo0.insert(1, singleTextCursor({ type: brand("Number"), value: 41 }));
				foo0.delete(2, 1);
				foo0.insert(2, singleTextCursor({ type: brand("Number"), value: 42 }));
				foo0.delete(0, 1);
				rootField.insert(0, singleTextCursor({ type: brand("Test") }));
				foo1.delete(0, 1);
				foo1.insert(0, singleTextCursor({ type: brand("Number"), value: "RootValue2" }));
				foo1.insert(0, singleTextCursor({ type: brand("Test") }));
				foo1.delete(1, 1);
				foo1.insert(1, singleTextCursor({ type: brand("Number"), value: 82 }));
				// Aborting the transaction should restore the forest
				return TransactionResult.Abort;
			});

			validateTree(branch, [initialState]);
		}

		it("can abandon a transaction", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1] = provider.trees;
			abortTransaction(tree1.view);
		});

		it("can abandon a transaction on a branch", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree] = provider.trees;
			abortTransaction(tree.view.fork());
		});

		it("can insert multiple nodes", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].view;
			const tree2 = provider.trees[1].view;

			// Insert nodes
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.insert(0, singleTextCursor({ type: brand("Test"), value: 1 }));
			});

			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.insert(1, singleTextCursor({ type: brand("Test"), value: 2 }));
			});

			provider.processMessages();

			// Validate insertion
			{
				const readCursor = tree2.forest.allocateCursor();
				moveToDetachedField(tree2.forest, readCursor);
				assert(readCursor.firstNode());
				assert.equal(readCursor.value, 1);
				assert.equal(readCursor.nextNode(), true);
				assert.equal(readCursor.value, 2);
				assert.equal(readCursor.nextNode(), false);
				readCursor.free();
			}
		});

		it("can move nodes across fields", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].view;
			const tree2 = provider.trees[1].view;

			const initialState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [
						{ type: brand("Node"), value: "a" },
						{ type: brand("Node"), value: "b" },
						{ type: brand("Node"), value: "c" },
					],
					bar: [
						{ type: brand("Node"), value: "d" },
						{ type: brand("Node"), value: "e" },
						{ type: brand("Node"), value: "f" },
					],
				},
			};
			initializeTestTree(tree1, initialState);

			runSynchronous(tree1, () => {
				const rootPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};
				tree1.editor.move(
					{ parent: rootPath, field: brand("foo") },
					1,
					2,
					{ parent: rootPath, field: brand("bar") },
					1,
				);
			});

			provider.processMessages();

			const expectedState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [{ type: brand("Node"), value: "a" }],
					bar: [
						{ type: brand("Node"), value: "d" },
						{ type: brand("Node"), value: "b" },
						{ type: brand("Node"), value: "c" },
						{ type: brand("Node"), value: "e" },
						{ type: brand("Node"), value: "f" },
					],
				},
			};
			validateTree(tree1, [expectedState]);
			validateTree(tree2, [expectedState]);
		});

		// TODO: unskip once the bug which compose is fixed
		it.skip("can make multiple moves in a transaction", () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0].view;

			const initialState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [{ type: brand("Node"), value: "a" }],
				},
			};
			initializeTestTree(tree, initialState);

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			// Perform multiple moves that should each be assigned a unique ID
			runSynchronous(tree, () => {
				tree.editor.move(
					{ parent: rootPath, field: brand("foo") },
					0,
					1,
					{ parent: rootPath, field: brand("bar") },
					0,
				);
				tree.editor.move(
					{ parent: rootPath, field: brand("bar") },
					0,
					1,
					{ parent: rootPath, field: brand("baz") },
					0,
				);
				runSynchronous(tree, () => {
					tree.editor.move(
						{ parent: rootPath, field: brand("baz") },
						0,
						1,
						{ parent: rootPath, field: brand("qux") },
						0,
					);
				});
			});

			const expectedState: JsonableTree = {
				type: brand("Node"),
				fields: {
					qux: [{ type: brand("Node"), value: "a" }],
				},
			};
			provider.processMessages();
			validateTree(tree, [expectedState]);
		});
	});

	describe("Undo and redo", () => {
		it("the insert of a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig);
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(tree1.branch);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyStringSequenceConfig);
			provider.processMessages();

			// Insert node
			tree1.editableTree.insertAtStart([value]);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual(tree2.editableTree.asArray, [value]);

			// Undo node insertion
			undoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual(tree1.editableTree.asArray, []);
			assert.deepEqual(tree2.editableTree.asArray, []);

			// Redo node insertion
			redoStack.pop()?.revert();
			provider.processMessages();

			assert.deepEqual(tree1.editableTree.asArray, [value]);
			assert.deepEqual(tree2.editableTree.asArray, [value]);
			unsubscribe();
		});

		it("rebased edits", () => {
			const provider = new TestTreeProviderLite(2);
			const content = {
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["A", "B", "C", "D"],
			} satisfies InitializeAndSchematizeConfiguration;
			const tree1 = provider.trees[0].schematize(content);

			const {
				undoStack: undoStack1,
				redoStack: redoStack1,
				unsubscribe: unsubscribe1,
			} = createTestUndoRedoStacks(tree1.branch);

			provider.processMessages();
			const tree2 =
				provider.trees[1].requireSchema(content.schema, () => fail("schema changed")) ??
				fail("schematize failed");
			const {
				undoStack: undoStack2,
				redoStack: redoStack2,
				unsubscribe: unsubscribe2,
			} = createTestUndoRedoStacks(tree2.branch);

			// Validate insertion
			validateTreeContent(tree2.branch, content);

			const root1 = tree1.editableTree;
			const root2 = tree2.editableTree;
			// Insert nodes on both trees
			root1.insertAt(1, ["x"]);
			assert.deepEqual(root1.asArray, ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, ["y"]);
			assert.deepEqual(root2.asArray, ["A", "B", "C", "y", "D"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			undoStack1.pop()?.revert();
			assert.deepEqual(root1.asArray, ["A", "B", "C", "y", "D"]);

			undoStack2.pop()?.revert();
			assert.deepEqual(root2.asArray, ["A", "x", "B", "C", "D"]);

			provider.processMessages();
			validateTreeContent(tree1.branch, content);
			validateTreeContent(tree2.branch, content);

			// Insert additional node at the beginning to require rebasing
			root1.insertAt(0, ["0"]);
			assert.deepEqual(root1.asArray, ["0", "A", "B", "C", "D"]);

			const expectedAfterRedo = ["0", "A", "x", "B", "C", "y", "D"];
			// Redo node insertion on both trees
			redoStack1.pop()?.revert();
			assert.deepEqual(root1.asArray, ["0", "A", "x", "B", "C", "D"]);

			redoStack2.pop()?.revert();
			assert.deepEqual(root2.asArray, ["A", "B", "C", "y", "D"]);

			provider.processMessages();
			assert.deepEqual(tree1.editableTree.asArray, expectedAfterRedo);
			assert.deepEqual(tree2.editableTree.asArray, expectedAfterRedo);
			unsubscribe1();
			unsubscribe2();
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
			const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig);
			provider.processMessages();
			const tree2 = assertSchema(provider.trees[1], stringSequenceRootSchema);

			const {
				undoStack: undoStack1,
				redoStack: redoStack1,
				unsubscribe: unsubscribe1,
			} = createTestUndoRedoStacks(tree1.branch);
			const {
				undoStack: undoStack2,
				redoStack: redoStack2,
				unsubscribe: unsubscribe2,
			} = createTestUndoRedoStacks(tree2.branch);

			// Insert node
			tree1.editableTree.insertAtStart([value]);
			provider.processMessages();

			// Validate insertion
			assert.deepEqual(tree2.editableTree.asArray, [value]);
			assert.equal(undoStack1.length, 1);
			assert.equal(undoStack2.length, 0);

			undoStack1.pop()?.revert();
			provider.processMessages();

			// Insert node
			tree2.editableTree.insertAtStart(["43"]);
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
			const tree1 = provider.trees[0].schematize({
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
			validateViewConsistency(tree1.branch, tree2.branch);

			const { undoStack: undoStack1, unsubscribe: unsubscribe1 } = createTestUndoRedoStacks(
				tree1.branch,
			);
			const { undoStack: undoStack2, unsubscribe: unsubscribe2 } = createTestUndoRedoStacks(
				tree2.branch,
			);

			const root1 = tree1.editableTree;
			const root2 = tree2.editableTree;
			// Insert a node on tree 2
			root2.insertAt(4, ["z"]);
			assert.deepEqual(root2.asArray, ["A", "B", "C", "D", "z"]);

			// Insert nodes on both trees
			root1.insertAt(1, ["x"]);
			assert.deepEqual(root1.asArray, ["A", "x", "B", "C", "D"]);

			root2.insertAt(3, ["y"]);
			assert.deepEqual(root2.asArray, ["A", "B", "C", "y", "D", "z"]);

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
			const view1 = provider.trees[0].schematize(config);
			await provider.ensureSynchronized();

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = view1;
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			pausedTree.editableTree.insertAt(1, ["b"]);
			pausedTree.editableTree.insertAt(2, ["c"]);
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const otherLoadedTree = assertSchema(
				provider.trees[1],
				stringSequenceRootSchema,
			).editableTree;
			otherLoadedTree.insertAtStart(["d"]);
			await provider.ensureSynchronized();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = await requestFluidObject<ITestFluidObject>(loadedContainer, "/");
			const tree = assertSchema(
				await dataStore.getSharedObject<ISharedTree>("TestSharedTree"),
				stringSequenceRootSchema,
			);
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();
			assert.deepEqual(tree.editableTree.asArray, ["d", "a", "b", "c"]);
			assert.deepEqual(otherLoadedTree.asArray, ["d", "a", "b", "c"]);
		});
	});

	describe("Anchors", () => {
		it("Anchors can be created and dereferenced", () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0].view;

			const initialState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [
						{ type: brand("Number"), value: 0 },
						{ type: brand("Number"), value: 1 },
						{ type: brand("Number"), value: 2 },
					],
				},
			};
			initializeTestTree(tree, initialState);

			const cursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, cursor);
			cursor.enterNode(0);
			cursor.enterField(brand("foo"));
			cursor.enterNode(0);
			cursor.seekNodes(1);
			const anchor = cursor.buildAnchor();
			cursor.free();
			const childPath = tree.locate(anchor);
			const expected: UpPath = {
				parent: {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				},
				parentField: brand("foo"),
				parentIndex: 1,
			};
			assert(compareUpPaths(childPath, expected));
		});
	});

	it("don't send ops before committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.branch.transaction.start();
		tree1.editableTree.insertAtStart(["x"]);
		provider.processMessages();
		assert.equal(opsReceived, 0);
		tree1.branch.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual(assertSchema(tree2, stringSequenceRootSchema).editableTree.asArray, ["x"]);
	});

	it("send only one op after committing", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.branch.transaction.start();
		tree1.editableTree.insertAtStart(["B"]);
		tree1.editableTree.insertAtStart(["A"]);
		tree1.branch.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual(assertSchema(tree2, stringSequenceRootSchema).editableTree.asArray, [
			"A",
			"B",
		]);
	});

	it("do not send an op after committing if nested", () => {
		const provider = new TestTreeProviderLite(2);
		const tree1 = provider.trees[0].schematize(emptyStringSequenceConfig);
		provider.processMessages();
		const tree2 = provider.trees[1];
		let opsReceived = 0;
		tree2.on("op", () => (opsReceived += 1));
		tree1.branch.transaction.start();
		tree1.branch.transaction.start();
		tree1.editableTree.insertAtStart("A");
		tree1.branch.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 0);
		const view2 = assertSchema(tree2, stringSequenceRootSchema).editableTree;
		assert.deepEqual(view2.asArray, []);
		tree1.editableTree.insertAtEnd(["B"]);
		tree1.branch.transaction.commit();
		provider.processMessages();
		assert.equal(opsReceived, 1);
		assert.deepEqual(view2.asArray, ["A", "B"]);
	});

	it("process changes while detached", async () => {
		const onCreate = (parentTree: SharedTree) => {
			const parent = parentTree.schematize({
				initialTree: ["A"],
				schema: stringSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			parent.branch.transaction.start();
			parent.editableTree.insertAtStart(["B"]);
			parent.branch.transaction.commit();
			const child = parent.fork();
			child.branch.transaction.start();
			child.editableTree.insertAtStart(["C"]);
			child.branch.transaction.commit();
			// TODO: better integrate ISharedTreeView2 with BranchView concept.
			parent.branch.merge(child.branch as ISharedTreeBranchView);
			assert.deepEqual(parent.editableTree.asArray, ["C", "B", "A"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const [tree] = provider.trees;
		assert.deepEqual(assertSchema(tree, stringSequenceRootSchema).editableTree.asArray, [
			"C",
			"B",
			"A",
		]);
	});
	describe("Stashed ops", () => {
		it("can apply and resubmit stashed schema ops", async () => {
			const provider = await TestTreeProvider.create(2);

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = provider.trees[0];
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			pausedTree.storedSchema.update(stringSequenceRootSchema);
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = await requestFluidObject<ITestFluidObject>(loadedContainer, "/");
			const tree = await dataStore.getSharedObject<ISharedTree>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();

			const otherLoadedTree = provider.trees[1];
			expectSchemaEquality(tree.contentSnapshot().schema, stringSequenceRootSchema);
			expectSchemaEquality(otherLoadedTree.storedSchema, stringSequenceRootSchema);
		});

		function expectSchemaEquality(actual: TreeStoredSchema, expected: TreeStoredSchema): void {
			const codec = makeSchemaCodec({ jsonValidator: noopValidator });
			assert.deepEqual(codec.encode(actual), codec.encode(expected));
		}
	});

	describe.skip("Fuzz Test fail cases", () => {
		it("Anchor Stability fails when root node is deleted", async () => {
			const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);

			const rootFieldSchema = SchemaBuilder.required(Any);
			const testSchemaBuilder = new SchemaBuilder({ scope: "testSchema" });
			const rootNodeSchema = testSchemaBuilder.objectRecursive("Node", {
				foo: SchemaBuilder.sequence(leaf.number),
				foo2: SchemaBuilder.sequence(leaf.number),
			});
			const testSchema = testSchemaBuilder.intoSchema(rootFieldSchema);

			// TODO: if this tests is just about deleting the root, it should use a simpler tree.
			const initialTreeState: JsonableTree = {
				type: rootNodeSchema.name,
				fields: {
					foo: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
					],
					foo2: [
						{ type: leaf.number.name, value: 0 },
						{ type: leaf.number.name, value: 1 },
						{ type: leaf.number.name, value: 2 },
					],
				},
			};
			const tree = provider.trees[0].view;
			initializeTestTree(tree, initialTreeState, testSchema);

			// building the anchor for anchor stability test
			const cursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, cursor);
			cursor.enterNode(0);
			cursor.getPath();
			cursor.firstField();
			cursor.getFieldKey();
			cursor.enterNode(1);
			const firstAnchor = cursor.buildAnchor();
			cursor.free();

			let anchorPath;

			// validate anchor
			const expectedPath: UpPath = {
				parent: {
					parent: undefined,
					parentIndex: 0,
					parentField: rootFieldKey,
				},
				parentField: brand("foo"),
				parentIndex: 1,
			};

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			let path: UpPath;
			// edit 1
			let readCursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, readCursor);
			let actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			// eslint-disable-next-line prefer-const
			path = {
				parent: rootPath,
				parentField: brand("foo2"),
				parentIndex: 1,
			};
			runSynchronous(tree, () => {
				const field = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.insert(
					1,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Abort;
			});

			anchorPath = tree.locate(firstAnchor);
			assert(compareUpPaths(expectedPath, anchorPath));

			readCursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 2
			runSynchronous(tree, () => {
				const field = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.delete(0, 1);
				return TransactionResult.Abort;
			});
			readCursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			anchorPath = tree.locate(firstAnchor);
			assert(compareUpPaths(expectedPath, anchorPath));
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
			assert.equal(trees[0].view.forest.computationName, "object-forest.ObjectForest");
		});

		it("ForestType.Reference uses ObjectForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestType.Reference,
				}),
			);
			assert.equal(trees[0].view.forest.computationName, "object-forest.ObjectForest");
		});

		it("ForestType.Optimized uses ChunkedForest", () => {
			const { trees } = new TestTreeProviderLite(
				1,
				new SharedTreeFactory({
					jsonValidator: typeboxValidator,
					forest: ForestType.Optimized,
				}),
			);
			assert.equal(trees[0].view.forest.computationName, "object-forest.ChunkedForest");
		});
	});
});

function assertSchema<TRoot extends TreeFieldSchema>(
	tree: ISharedTree,
	schema: TreeSchema<TRoot>,
): ISharedTreeView2<TRoot> {
	return tree.requireSchema(schema, () => assert.fail()) ?? assert.fail();
}

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 *
 * TODO: users of this are making schema: one has been provided that might be close, but likely isn't fully correct..
 * TODO: users of this doesn't depend on SharedTree directly and should be moved to tests of SharedTreeView.
 */
function itView(title: string, fn: (view: ISharedTreeView) => void): void {
	const content: TreeContent = {
		schema: jsonSequenceRootSchema,
		initialTree: [],
	};
	const config = {
		...content,
		allowedSchemaModifications: AllowedUpdateType.None,
	};
	it(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		// Test an actual SharedTree.
		fn(provider.trees[0].schematize(config).branch);
	});

	it(`${title} (reference view)`, () => {
		fn(viewWithContent(content));
	});

	it(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		fn(provider.trees[0].schematize(config).branch.fork());
	});

	it(`${title} (reference forked view)`, () => {
		fn(viewWithContent(content).fork());
	});
}
