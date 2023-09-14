/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import { ITestFluidObject, waitForContainerConnection } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IContainerExperimental } from "@fluidframework/container-loader";
import {
	singleTextCursor,
	makeSchemaCodec,
	jsonableTreeFromCursor,
	on,
	ContextuallyTypedNodeData,
	SchemaBuilder,
	Any,
	TreeStatus,
} from "../../feature-libraries";
import { brand, fail, TransactionResult } from "../../util";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
	jsonSequenceRootSchema,
	toJsonableTree,
	validateTree,
	validateTreeContent,
	validateViewConsistency,
	viewWithContent,
	wrongSchema,
} from "../utils";
import {
	ForestType,
	ISharedTree,
	ISharedTreeView,
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
	TreeValue,
	UpPath,
	Value,
	moveToDetachedField,
	SchemaData,
	ValueSchema,
	AllowedUpdateType,
	LocalCommitSource,
	storedEmptyFieldSchema,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { EditManager } from "../../shared-tree-core";
import { jsonNumber, jsonSchema } from "../../domains";
import { noopValidator } from "../../codec";

const schemaCodec = makeSchemaCodec({ jsonValidator: typeboxValidator });

const fooKey: FieldKey = brand("foo");

const emptyJsonSequenceConfig: InitializeAndSchematizeConfiguration = {
	schema: jsonSequenceRootSchema,
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: [],
};

describe("SharedTree", () => {
	// TODO: concurrent use of schematize should not double initialize. Should use constraints so second run conflicts.
	it.skip("Concurrent Schematize", () => {
		const provider = new TestTreeProviderLite(2);
		const content: InitializeAndSchematizeConfiguration = {
			schema: jsonSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [1],
		};
		const tree1 = provider.trees[0].schematize(content);
		provider.trees[1].schematize(content);
		provider.processMessages();

		validateRootField(tree1, [1]);
	});

	it("reads only one node", () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const view = viewWithContent({ schema: jsonSequenceRootSchema, initialTree: [] });
		runSynchronous(view, (t) => {
			t.context.root.insertNodes(0, [5]);
		});

		assert.deepEqual(toJsonableTree(view), [{ type: jsonNumber.name, value: 5 }]);
	});

	it("editable-tree-2-end-to-end", () => {
		const builder = new SchemaBuilder("e2e");
		const numberSchema = builder.leaf("number", ValueSchema.Number);
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldValue(numberSchema));
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
		const root = view.editableTree2(schema);
		const leaf = root.boxedContent;
		assert.equal(leaf.value, 1);
		root.setContent(2);
		assert(leaf.treeStatus() !== TreeStatus.InDocument);
		assert.equal(root.content, 2);
	});

	it("can be connected to another tree", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const value = "42";
		const expectedSchema = schemaCodec.encode(jsonSequenceRootSchema);

		// Apply an edit to the first tree which inserts a node with a value
		const view1 = provider.trees[0].schematize({
			schema: jsonSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: [value],
		});

		// Ensure that the first tree has the state we expect
		assert.equal(getTestValue(view1), value);
		assert.equal(schemaCodec.encode(provider.trees[0].storedSchema), expectedSchema);
		// Ensure that the second tree receives the expected state from the first tree
		await provider.ensureSynchronized();
		validateViewConsistency(view1, provider.trees[1].view);
		// Ensure that a tree which connects after the edit has already happened also catches up
		const joinedLaterTree = await provider.createTree();
		validateViewConsistency(view1, joinedLaterTree.view);
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
		const tree2 = (await provider.createTree()).view;
		const tree3 = (await provider.createTree()).view;
		const [container1, container2, container3] = provider.containers;

		const tree1 = provider.trees[0].schematize({
			schema: jsonSequenceRootSchema,
			allowedSchemaModifications: AllowedUpdateType.None,
			initialTree: ["Z", "A", "C"],
		});

		await provider.ensureSynchronized();

		// Stop the processing of incoming changes on tree3 so that it does not learn about the deletion of Z
		await provider.opProcessingController.pauseProcessing(container3);

		// Delete Z
		remove(tree2, 0, 1);

		// Ensure tree2 has a chance to send deletion of Z
		await provider.opProcessingController.processOutgoing(container2);

		// Ensure tree1 has a chance to receive the deletion of Z before putting out a summary
		await provider.opProcessingController.processIncoming(container1);
		validateRootField(tree1, ["A", "C"]);

		// Have tree1 make a summary
		// Summarized state: A C
		await provider.summarize();

		// Insert B between A and C (without knowing of Z being deleted)
		insert(tree3, 2, "B");

		// Ensure the insertion of B is sent for processing by tree3 before tree3 receives the deletion of Z
		await provider.opProcessingController.processOutgoing(container3);

		// Allow tree3 to receive further changes (i.e., the deletion of Z)
		provider.opProcessingController.resumeProcessing(container3);

		// Ensure all trees are now caught up
		await provider.ensureSynchronized();

		// Load the last summary (state: "AC") and process the deletion of Z and insertion of B
		const tree4 = (await provider.createTree()).view;

		// Ensure tree4 has a chance to process trailing ops.
		await provider.ensureSynchronized();

		// Trees 1 through 3 should get the correct end state (ABC) whether we include EditManager data
		// in summaries or not.
		const expectedValues = ["A", "B", "C"];
		validateRootField(tree1, expectedValues);
		validateRootField(tree2, expectedValues);
		validateRootField(tree3, expectedValues);
		// tree4 should only get the correct end state if it was able to get the adequate
		// EditManager state from the summary. Specifically, in order to correctly rebase the insert
		// of B, tree4 needs to have a local copy of the edit that deleted Z, so it can
		// rebase the insertion of  B over that edit.
		// Without that, it will interpret the insertion of B based on the current state, yielding
		// the order ACB.
		validateRootField(tree4, expectedValues);
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

	it("can summarize local edits in the attach summary", async () => {
		const onCreate = (tree: SharedTree) => {
			tree.storedSchema.update(jsonSequenceRootSchema);
			insert(tree.view, 0, "A");
			insert(tree.view, 1, "C");
			validateRootField(tree.view, ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const tree1 = provider.trees[0].view;
		validateRootField(tree1, ["A", "C"]);
		const tree2 = (await provider.createTree()).view;
		// Check that the joining tree was initialized with data from the attach summary
		validateRootField(tree2, ["A", "C"]);

		// Check that further edits are interpreted properly
		insert(tree1, 1, "B");
		await provider.ensureSynchronized();
		validateRootField(tree1, ["A", "B", "C"]);
		validateRootField(tree2, ["A", "B", "C"]);
	});

	it("has bounded memory growth in EditManager", () => {
		const provider = new TestTreeProviderLite(2);
		provider.trees[0].schematize(emptyJsonSequenceConfig);

		const [tree1, tree2] = provider.trees.map((t) => t.view);

		// Make some arbitrary number of edits
		for (let i = 0; i < 10; ++i) {
			insert(tree1, 0, "");
		}

		provider.processMessages();

		// These two edit will have ref numbers that correspond to the last of the above edits
		insert(tree1, 0, "");
		insert(tree2, 0, "");

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
			const view = t.schematize(emptyJsonSequenceConfig);
			insertFirstNode(view, "B");
			insertFirstNode(view, "A");
			validateRootField(view, ["A", "B"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const tree = provider.trees[0].view;
		validateRootField(tree, ["A", "B"]);
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
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyJsonSequenceConfig);
			provider.processMessages();

			// Insert node
			tree1.context.root.insertNodes(0, [value]);
			provider.processMessages();

			// Validate insertion
			validateRootField(tree2, [value]);

			// Delete node
			remove(tree1, 0, 1);

			provider.processMessages();

			validateRootField(tree1, []);
			validateRootField(tree2, []);
		});

		it("can handle competing deletes", () => {
			for (const index of [0, 1, 2, 3]) {
				const provider = new TestTreeProviderLite(4);
				const config: InitializeAndSchematizeConfiguration = {
					schema: jsonSequenceRootSchema,
					initialTree: [0, 1, 2, 3],
					allowedSchemaModifications: AllowedUpdateType.None,
				};
				const tree1 = provider.trees[0].schematize(config);
				provider.processMessages();
				const tree2 = provider.trees[1].schematize(config);
				const tree3 = provider.trees[2].schematize(config);
				const tree4 = provider.trees[3].schematize(config);
				provider.processMessages();

				remove(tree1, index, 1);
				remove(tree2, index, 1);
				remove(tree3, index, 1);

				provider.processMessages();

				const expectedSequence = [0, 1, 2, 3];
				expectedSequence.splice(index, 1);
				validateRootField(tree1, expectedSequence);
				validateRootField(tree2, expectedSequence);
				validateRootField(tree3, expectedSequence);
				validateRootField(tree4, expectedSequence);
			}
		});

		it("can insert and delete a node in an optional field", () => {
			const value = 42;
			const provider = new TestTreeProviderLite(2);
			const schema = new SchemaBuilder("optional", {}, jsonSchema).intoDocumentSchema(
				SchemaBuilder.fieldOptional(jsonNumber),
			);
			const config: InitializeAndSchematizeConfiguration = {
				schema,
				initialTree: value,
				allowedSchemaModifications: AllowedUpdateType.None,
			};
			const tree1 = provider.trees[0].schematize(config);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(config);

			// Delete node
			tree1.setContent(undefined);
			provider.processMessages();
			assert.equal(tree1.root, undefined);
			assert.equal(tree2.root, undefined);

			// Set node
			tree1.setContent(43);
			provider.processMessages();
			assert.equal(tree1.root, 43);
			assert.equal(tree2.root, 43);
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
		it("does nothing if there are no commits in the undo stack", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyJsonSequenceConfig);
			provider.processMessages();

			// Insert node
			insertFirstNode(tree1, value);
			provider.processMessages();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);

			// Undo node insertion
			tree1.undo();
			provider.processMessages();

			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);

			// Undo again
			tree1.undo();
			provider.processMessages();

			// Redo
			tree1.redo();
			provider.processMessages();

			assert.equal(getTestValue(tree1), value);
			assert.equal(getTestValue(tree2), value);

			// Redo again
			tree1.redo();
			provider.processMessages();

			assert.equal(getTestValue(tree1), value);
			assert.equal(getTestValue(tree2), value);
		});

		it("does not undo edits made remotely", () => {
			const provider = new TestTreeProviderLite(2);
			const content: InitializeAndSchematizeConfiguration = {
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["tree2"],
			};
			// Do initialization on tree2
			const tree2 = provider.trees[1].schematize(content);
			provider.processMessages();
			const tree1 = provider.trees[0].schematize(content);
			provider.processMessages();

			validateRootField(tree1, ["tree2"]);

			// Insert node
			insert(tree1, 0, "tree1");
			provider.processMessages();

			validateRootField(tree1, ["tree1", "tree2"]);

			// Make a remote edit
			remove(tree2, 1, 1);
			provider.processMessages();

			// Validate deletion
			validateRootField(tree1, ["tree1"]);

			// Undo
			tree1.undo(); // undoes insert of "tree1"
			// Call undo to ensure it doesn't undo the change from tree2
			tree1.undo(); // No-op
			provider.processMessages();

			// Validate undo
			validateRootField(tree1, []);
			validateRootField(tree2, []);

			// Call redo
			tree1.redo();
			provider.processMessages();

			// Validate redo
			validateRootField(tree1, ["tree1"]);
		});

		it("the insert of a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyJsonSequenceConfig);
			provider.processMessages();

			// Insert node
			insertFirstNode(tree1, value);
			provider.processMessages();

			// Validate insertion
			validateRootField(tree2, [value]);

			// Undo node insertion
			tree1.undo();
			provider.processMessages();

			validateRootField(tree1, []);
			validateRootField(tree2, []);

			// Redo node insertion
			tree1.redo();
			provider.processMessages();

			validateRootField(tree1, [value]);
			validateRootField(tree2, [value]);
		});

		it("rebased edits", () => {
			const provider = new TestTreeProviderLite(2);
			const content: InitializeAndSchematizeConfiguration = {
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
				initialTree: ["A", "B", "C", "D"],
			};
			const tree1 = provider.trees[0].schematize(content);
			const tree2 = provider.trees[1].view;
			provider.processMessages();

			// Validate insertion
			validateTreeContent(tree2, content);

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			assert.deepEqual([...tree1.context.root], ["A", "x", "B", "C", "D"]);

			insert(tree2, 3, "y");
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "y", "D"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			tree1.undo();
			assert.deepEqual([...tree1.context.root], ["A", "B", "C", "y", "D"]);

			tree2.undo();
			assert.deepEqual([...tree2.context.root], ["A", "x", "B", "C", "D"]);

			provider.processMessages();
			validateTreeContent(tree1, content);
			validateTreeContent(tree2, content);

			// Insert additional node at the beginning to require rebasing
			insert(tree1, 0, "0");
			assert.deepEqual([...tree1.context.root], ["0", "A", "B", "C", "D"]);

			const expectedAfterRedo = ["0", "A", "x", "B", "C", "y", "D"];
			// Redo node insertion on both trees
			tree1.redo();
			assert.deepEqual([...tree1.context.root], ["0", "A", "x", "B", "C", "D"]);

			tree2.redo();
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "y", "D"]);

			provider.processMessages();
			validateRootField(tree1, expectedAfterRedo);
			validateRootField(tree2, expectedAfterRedo);
		});

		it("updates rebased undoable commits in the correct order", () => {
			const provider = new TestTreeProviderLite(2);

			// Initialize the tree
			const content: InitializeAndSchematizeConfiguration = {
				initialTree: ["A", "B", "C", "D"],
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			};
			const tree1 = provider.trees[0].schematize(content);
			const tree2 = provider.trees[1].view;
			provider.processMessages();

			// Validate initialization
			validateTreeContent(tree2, content);

			// Insert a node on tree 2
			insert(tree2, 4, "z");
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "D", "z"]);

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			assert.deepEqual([...tree1.context.root], ["A", "x", "B", "C", "D"]);

			insert(tree2, 3, "y");
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "y", "D", "z"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			tree1.undo();
			assert.deepEqual([...tree1.context.root], ["A", "B", "C", "y", "D", "z"]);

			// First undo should be the insertion of y
			tree2.undo();
			assert.deepEqual([...tree2.context.root], ["A", "x", "B", "C", "D", "z"]);
			tree2.undo();
			assert.deepEqual([...tree2.context.root], ["A", "x", "B", "C", "D"]);

			provider.processMessages();
			validateTreeContent(tree1, content);
			validateTreeContent(tree2, content);

			// Insert additional node at the beginning to require rebasing
			insert(tree1, 0, "0");
			assert.deepEqual([...tree1.context.root], ["0", "A", "B", "C", "D"]);
			provider.processMessages();

			const expectedAfterRedo = ["0", "A", "x", "B", "C", "y", "D", "z"];

			// Redo node insertion on both trees
			tree1.redo();
			assert.deepEqual([...tree1.context.root], ["0", "A", "x", "B", "C", "D"]);

			// First redo should be the insertion of z
			tree2.redo();
			assert.deepEqual([...tree2.context.root], ["0", "A", "B", "C", "D", "z"]);
			tree2.redo();
			assert.deepEqual([...tree2.context.root], ["0", "A", "B", "C", "y", "D", "z"]);

			provider.processMessages();
			assert.deepEqual([...tree1.context.root], expectedAfterRedo);
			assert.deepEqual([...tree2.context.root], expectedAfterRedo);
		});

		it("an insert after another undo has been sequenced", () => {
			const value = "42";
			const value2 = "43";
			const value3 = "44";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize({
				initialTree: ["A", "B", "C", "D"],
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			const tree2 = provider.trees[1].view;
			provider.processMessages();

			// Insert node
			insert(tree1, 1, value);
			insert(tree1, 2, value2);

			assert.deepEqual([...tree1.context.root], ["A", value, value2, "B", "C", "D"]);

			insert(tree2, 0, value3);
			assert.deepEqual([...tree2.context.root], [value3, "A", "B", "C", "D"]);

			// Undo insertion of value2
			tree1.undo();

			assert.deepEqual([...tree1.context.root], ["A", value, "B", "C", "D"]);

			// Sequence after the undo to ensure that undo commits are tracked
			// correctly in the trunk undo redo manager and after the and after the insert
			// on tree2 to cause rebasing of the local branch on tree1
			provider.processMessages();

			assert.deepEqual([...tree1.context.root], [value3, "A", value, "B", "C", "D"]);
			assert.deepEqual([...tree2.context.root], [value3, "A", value, "B", "C", "D"]);

			// Undo insertion of value
			tree1.undo();

			assert.deepEqual([...tree1.context.root], [value3, "A", "B", "C", "D"]);

			// Insert another value to cause rebasing
			insert(tree2, 0, value3);
			assert.deepEqual([...tree2.context.root], [value3, value3, "A", value, "B", "C", "D"]);

			provider.processMessages();

			// Redo node insertion
			tree1.redo();
			provider.processMessages();

			assert.deepEqual([...tree1.context.root], [value3, value3, "A", value, "B", "C", "D"]);
			assert.deepEqual([...tree2.context.root], [value3, value3, "A", value, "B", "C", "D"]);
		});
	});

	// TODO: many of these events tests should be tests of SharedTreeView instead.
	describe("Events", () => {
		const builder = new SchemaBuilder("Events test schema");
		const numberSchema = builder.leaf("number", ValueSchema.Number);
		const treeSchema = builder.struct("root", {
			x: SchemaBuilder.fieldValue(numberSchema),
		});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));

		it("triggers events for local and subtree changes", () => {
			const view = viewWithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const rootNode = view.context.root.getNode(0);
			const root = view.root as unknown as { x: number };
			const log: string[] = [];
			const unsubscribe = rootNode[on]("changing", () => log.push("change"));
			const unsubscribeSubtree = rootNode[on]("subtreeChanging", () => {
				log.push("subtree");
			});
			const unsubscribeAfter = view.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree",
				"change",
				"subtree",
				"change",
				"after",
				"editStart",
				"subtree",
				"change",
				"subtree",
				"change",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		it("propagates path args for local and subtree changes", () => {
			const view = viewWithContent({
				schema,
				initialTree: {
					x: 24,
				},
			});
			const rootNode = view.context.root.getNode(0);
			const root = view.root as unknown as { x: number };
			const log: string[] = [];
			const unsubscribe = rootNode[on]("changing", (upPath) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeSubtree = rootNode[on]("subtreeChanging", (upPath) => {
				log.push(`subtree-${String(upPath.parentField)}-${upPath.parentIndex}`);
			});
			const unsubscribeAfter = view.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root.x = 5;
			log.push("editStart");
			root.x = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root.x = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"editStart",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"subtree-rootFieldKey-0",
				"change-rootFieldKey-0",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		it("triggers revertible events for local changes", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			const tree2 = provider.trees[1].view;
			provider.processMessages();

			const revertibles1: LocalCommitSource[] = [];
			tree1.events.on("revertible", (commitSource) => {
				revertibles1.push(commitSource);
			});

			const revertibles2: LocalCommitSource[] = [];
			tree2.events.on("revertible", (commitSource) => {
				revertibles2.push(commitSource);
			});

			// Insert node
			insertFirstNode(tree1, "42");
			provider.processMessages();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);
			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, []);

			tree1.undo();
			provider.processMessages();

			// Insert node
			insertFirstNode(tree2, "43");
			provider.processMessages();

			assert.deepEqual(revertibles1, [LocalCommitSource.Default, LocalCommitSource.Undo]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);

			tree1.redo();
			provider.processMessages();

			assert.deepEqual(revertibles1, [
				LocalCommitSource.Default,
				LocalCommitSource.Undo,
				LocalCommitSource.Redo,
			]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);
		});

		it("triggers a revertible event for a changes merged into the local branch", () => {
			const tree1 = viewWithContent({
				schema: jsonSequenceRootSchema,
				initialTree: [],
			});
			const branch = tree1.fork();

			const revertibles1: LocalCommitSource[] = [];
			tree1.events.on("revertible", (commitSource) => {
				revertibles1.push(commitSource);
			});

			const revertibles2: LocalCommitSource[] = [];
			branch.events.on("revertible", (commitSource) => {
				revertibles2.push(commitSource);
			});

			// Insert node
			branch.setContent(["42"]);

			assert.deepEqual(revertibles1, []);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);

			tree1.merge(branch);
			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);
		});

		it("doesn't trigger a revertible event for rebases", () => {
			const provider = new TestTreeProviderLite(2);
			// Initialize the tree
			const tree1 = provider.trees[0].schematize({
				initialTree: ["A", "B", "C", "D"],
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			const tree2 = provider.trees[1].view;

			provider.processMessages();

			// Validate initialization
			validateViewConsistency(tree1, tree2);

			const revertibles1: LocalCommitSource[] = [];
			tree1.events.on("revertible", (commitSource) => {
				revertibles1.push(commitSource);
			});

			const revertibles2: LocalCommitSource[] = [];
			tree2.events.on("revertible", (commitSource) => {
				revertibles2.push(commitSource);
			});

			// Insert a node on tree 2
			insert(tree2, 4, "z");
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "D", "z"]);

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			assert.deepEqual([...tree1.context.root], ["A", "x", "B", "C", "D"]);

			insert(tree2, 3, "y");
			assert.deepEqual([...tree2.context.root], ["A", "B", "C", "y", "D", "z"]);

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default, LocalCommitSource.Default]);
		});
	});

	// TODO:
	// These tests should either be tests of SharedTreeView, EditManager, or the relevant field kind's rebase function.
	// Keeping a couple integration tests for rebase at this level might be ok (for example schema vs other edits), but that should be minimal,
	// and those tests should setup proper schema, and use the high levels editing APIs (editable tree) if they are serving as integration tests of SharedTree,
	describe("Rebasing", () => {
		it("rebases stashed ops with prior state present", async () => {
			const provider = await TestTreeProvider.create(2);
			const view1 = provider.trees[0].schematize({
				initialTree: ["a"],
				schema: jsonSequenceRootSchema,
				allowedSchemaModifications: AllowedUpdateType.None,
			});
			await provider.ensureSynchronized();

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = view1;
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			insert(pausedTree, 1, "b");
			insert(pausedTree, 2, "c");
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const otherLoadedTree = provider.trees[1].view;
			insert(otherLoadedTree, 0, "d");
			await provider.ensureSynchronized();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = await requestFluidObject<ITestFluidObject>(loadedContainer, "/");
			const tree = await dataStore.getSharedObject<ISharedTree>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();
			validateRootField(tree.view, ["d", "a", "b", "c"]);
			validateRootField(otherLoadedTree, ["d", "a", "b", "c"]);
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

	describe("Views", () => {
		itView("can fork and apply edits without affecting the parent", (parent) => {
			insertFirstNode(parent, "parent");
			const child = parent.fork();
			insertFirstNode(child, "child");
			assert.equal(getTestValue(parent), "parent");
			assert.deepEqual(getTestValues(child), ["parent", "child"]);
		});

		itView("can apply edits without affecting a fork", (parent) => {
			const child = parent.fork();
			assert.equal(getTestValue(parent), undefined);
			assert.equal(getTestValue(child), undefined);
			insertFirstNode(parent, "root");
			assert.equal(getTestValue(parent), "root");
			assert.equal(getTestValue(child), undefined);
		});

		itView("can merge changes into a parent", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "view");
			parent.merge(child);
			assert.equal(getTestValue(parent), "view");
		});

		itView("can rebase over a parent view", (parent) => {
			const child = parent.fork();
			insertFirstNode(parent, "root");
			assert.equal(getTestValue(child), undefined);
			child.rebaseOnto(parent);
			assert.equal(getTestValue(child), "root");
		});

		itView("can rebase over a child view", (view) => {
			const parent = view.fork();
			insertFirstNode(parent, "P1");
			const child = parent.fork();
			insertFirstNode(parent, "P2");
			insertFirstNode(child, "C1");
			parent.rebaseOnto(child);
			assert.deepEqual(getTestValues(child), ["P1", "C1"]);
			assert.deepEqual(getTestValues(parent), ["P1", "C1", "P2"]);
		});

		itView("merge changes through multiple views", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewD, "view");
			viewC.merge(viewD);
			assert.equal(getTestValue(viewB), undefined);
			assert.equal(getTestValue(viewC), "view");
			viewB.merge(viewC);
			assert.equal(getTestValue(viewB), "view");
			assert.equal(getTestValue(viewC), "view");
		});

		itView("merge correctly when multiple ancestors are mutated", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewB, "B");
			insertFirstNode(viewC, "C");
			insertFirstNode(viewD, "D");
			viewC.merge(viewD);
			assert.equal(getTestValue(viewB), "B");
			assert.equal(getTestValue(viewC), "D");
			viewB.merge(viewC);
			assert.equal(getTestValue(viewB), "D");
		});

		itView("can merge a parent view into a child", (view) => {
			const parent = view.fork();
			insertFirstNode(parent, "P1");
			const child = parent.fork();
			insertFirstNode(parent, "P2");
			insertFirstNode(child, "C1");
			child.merge(parent);
			assert.deepEqual(getTestValues(child), ["P1", "C1", "P2"]);
			assert.deepEqual(getTestValues(parent), ["P1", "P2"]);
		});

		itView("can perform a complicated merge scenario", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			insertFirstNode(viewB, "A1");
			insertFirstNode(viewC, "B1");
			insertFirstNode(viewD, "C1");
			viewC.merge(viewD);
			insertFirstNode(viewA, "R1");
			insertFirstNode(viewB, "A2");
			insertFirstNode(viewC, "B2");
			viewB.merge(viewC);
			const viewE = viewB.fork();
			insertFirstNode(viewB, "A3");
			viewE.rebaseOnto(viewB);
			assert.equal(getTestValue(viewE), "A3");
			insertFirstNode(viewB, "A4");
			insertFirstNode(viewE, "D1");
			insertFirstNode(viewA, "R2");
			viewB.merge(viewE);
			viewA.merge(viewB);
			insertFirstNode(viewA, "R3");
			assert.deepEqual(getTestValues(viewA), [
				"R1",
				"R2",
				"A1",
				"A2",
				"B1",
				"C1",
				"B2",
				"A3",
				"A4",
				"D1",
				"R3",
			]);
		});

		itView("update anchors after applying a change", (view) => {
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging into a parent", (parent) => {
			insertFirstNode(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			insertFirstNode(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging a branch into a divergent parent", (parent) => {
			insertFirstNode(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			insertFirstNode(parent, "P");
			insertFirstNode(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after undoing", (view) => {
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			view.undo();
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("can be mutated after merging", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "A");
			parent.merge(child, false);
			insertFirstNode(child, "B");
			assert.deepEqual(getTestValues(parent), ["A"]);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
			parent.merge(child);
			assert.deepEqual(getTestValues(parent), ["A", "B"]);
		});

		itView("can rebase after merging", (parent) => {
			const child = parent.fork();
			insertFirstNode(child, "A");
			parent.merge(child, false);
			insertFirstNode(parent, "B");
			child.rebaseOnto(parent);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
		});

		itView("can be read after merging", (parent) => {
			insertFirstNode(parent, "root");
			const child = parent.fork();
			parent.merge(child);
			assert.equal(getTestValue(child), "root");
		});

		itView("properly fork the tree schema", (parent) => {
			const schemaA: SchemaData = {
				treeSchema: new Map([]),
				rootFieldSchema: storedEmptyFieldSchema,
			};
			const schemaB: SchemaData = {
				treeSchema: new Map([[jsonNumber.name, jsonNumber]]),
				rootFieldSchema: storedEmptyFieldSchema,
			};
			function getSchema(t: ISharedTreeView): "schemaA" | "schemaB" {
				return t.storedSchema.treeSchema.size === 0 ? "schemaA" : "schemaB";
			}

			parent.storedSchema.update(schemaA);
			assert.equal(getSchema(parent), "schemaA");
			const child = parent.fork();
			child.storedSchema.update(schemaB);
			assert.equal(getSchema(parent), "schemaA");
			assert.equal(getSchema(child), "schemaB");
		});

		it("submit edits to Fluid when merging into the root view", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const baseView = tree1.fork();
			const view = baseView.fork();
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			insertFirstNode(view, "42");
			provider.processMessages();
			assert.equal(getTestValue(tree2), undefined);
			baseView.merge(view);
			provider.processMessages();
			assert.equal(getTestValue(tree2), undefined);
			tree1.merge(baseView);
			provider.processMessages();
			assert.equal(getTestValue(tree2), "42");
		});

		it("do not squash commits", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1];
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			const baseView = tree1.fork();
			const view = baseView.fork();
			insertFirstNode(view, "A");
			insertFirstNode(view, "B");
			baseView.merge(view);
			tree1.merge(baseView);
			provider.processMessages();
			assert.equal(opsReceived, 2);
		});
	});

	describe("Transactions", () => {
		itView("update the tree while open", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			assert.equal(getTestValue(view), 42);
		});

		itView("update the tree after committing", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("revert the tree after aborting", (view) => {
			view.transaction.start();
			insertFirstNode(view, 42);
			view.transaction.abort();
			assert.equal(getTestValue(view), undefined);
		});

		itView("can nest", (view) => {
			view.transaction.start();
			insertFirstNode(view, "A");
			view.transaction.start();
			insertFirstNode(view, "B");
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
		});

		itView("can span a view fork and merge", (view) => {
			view.transaction.start();
			const fork = view.fork();
			insertFirstNode(fork, 42);
			assert.throws(
				() => view.merge(fork, false),
				(e: Error) =>
					validateAssertionError(
						e,
						"A view that is merged into an in-progress transaction must be disposed",
					),
			);
			view.merge(fork, true);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("automatically commit if in progress when view merges", (view) => {
			const fork = view.fork();
			fork.transaction.start();
			insertFirstNode(fork, 42);
			insertFirstNode(fork, 43);
			view.merge(fork, false);
			assert.deepEqual(getTestValues(fork), [42, 43]);
			assert.equal(fork.transaction.inProgress(), false);
		});

		itView("do not close across forks", (view) => {
			view.transaction.start();
			const fork = view.fork();
			assert.throws(
				() => fork.transaction.commit(),
				(e: Error) => validateAssertionError(e, "No transaction is currently in progress"),
			);
		});

		itView("do not affect pre-existing forks", (view) => {
			const fork = view.fork();
			insertFirstNode(view, "A");
			fork.transaction.start();
			insertFirstNode(view, "B");
			fork.transaction.abort();
			insertFirstNode(view, "C");
			view.merge(fork);
			assert.deepEqual(getTestValues(view), ["A", "B", "C"]);
		});

		itView("can handle a pull while in progress", (view) => {
			const fork = view.fork();
			fork.transaction.start();
			insertFirstNode(view, 42);
			fork.rebaseOnto(view);
			assert.equal(getTestValue(fork), 42);
			fork.transaction.commit();
			assert.equal(getTestValue(fork), 42);
		});

		itView("update anchors correctly", (view) => {
			insertFirstNode(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			insertFirstNode(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("can handle a complicated scenario", (view) => {
			insertFirstNode(view, "A");
			view.transaction.start();
			insertFirstNode(view, "B");
			insertFirstNode(view, "C");
			view.transaction.start();
			insertFirstNode(view, "D");
			const fork = view.fork();
			insertFirstNode(fork, "E");
			fork.transaction.start();
			insertFirstNode(fork, "F");
			insertFirstNode(view, "G");
			fork.transaction.commit();
			insertFirstNode(fork, "H");
			fork.transaction.start();
			insertFirstNode(fork, "I");
			fork.transaction.abort();
			view.merge(fork);
			insertFirstNode(view, "J");
			view.transaction.start();
			const fork2 = view.fork();
			insertFirstNode(fork2, "K");
			insertFirstNode(fork2, "L");
			view.merge(fork2);
			view.transaction.abort();
			insertFirstNode(view, "M");
			view.transaction.commit();
			insertFirstNode(view, "N");
			view.transaction.commit();
			insertFirstNode(view, "O");
			assert.deepEqual(getTestValues(view), [
				"A",
				"B",
				"C",
				"D",
				"G",
				"E",
				"F",
				"H",
				"J",
				"M",
				"N",
				"O",
			]);
		});

		it("don't send ops before committing", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1];
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			insertFirstNode(tree1, 42);
			provider.processMessages();
			assert.equal(opsReceived, 0);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValue(tree2.view), 42);
		});

		it("send only one op after committing", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1];
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			insertFirstNode(tree1, 42);
			insertFirstNode(tree1, 43);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValues(tree2.view), [42, 43]);
		});

		it("do not send an op after committing if nested", () => {
			const provider = new TestTreeProviderLite(2);
			const tree1 = provider.trees[0].schematize(emptyJsonSequenceConfig);
			provider.processMessages();
			const tree2 = provider.trees[1];
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			tree1.transaction.start();
			insertFirstNode(tree1, 42);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 0);
			assert.deepEqual(getTestValues(tree2.view), []);
			insertFirstNode(tree1, 43);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValues(tree2.view), [42, 43]);
		});

		it("process changes while detached", async () => {
			const onCreate = (parentTree: SharedTree) => {
				const parent = parentTree.schematize({
					initialTree: ["A"],
					schema: jsonSequenceRootSchema,
					allowedSchemaModifications: AllowedUpdateType.None,
				});
				parent.transaction.start();
				insertFirstNode(parent, "B");
				parent.transaction.commit();
				const child = parent.fork();
				child.transaction.start();
				insertFirstNode(child, "C");
				child.transaction.commit();
				parent.merge(child);
				assert.deepEqual(getTestValues(parent), ["A", "B", "C"]);
			};
			const provider = await TestTreeProvider.create(
				1,
				undefined,
				new SharedTreeTestFactory(onCreate),
			);
			const [tree] = provider.trees;
			assert.deepEqual(getTestValues(tree.view), ["A", "B", "C"]);
		});
	});

	describe("Stashed ops", () => {
		it("can apply and resubmit stashed schema ops", async () => {
			const provider = await TestTreeProvider.create(2);

			const pausedContainer: IContainerExperimental = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = provider.trees[0];
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			pausedTree.storedSchema.update(jsonSequenceRootSchema);
			const pendingOps = await pausedContainer.closeAndGetPendingLocalState?.();
			provider.opProcessingController.resumeProcessing();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = await requestFluidObject<ITestFluidObject>(loadedContainer, "/");
			const tree = await dataStore.getSharedObject<ISharedTree>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();

			const otherLoadedTree = provider.trees[1];
			expectSchemaEquality(tree.view.storedSchema, jsonSequenceRootSchema);
			expectSchemaEquality(otherLoadedTree.storedSchema, jsonSequenceRootSchema);
		});

		function expectSchemaEquality(actual: SchemaData, expected: SchemaData): void {
			const codec = makeSchemaCodec({ jsonValidator: noopValidator });
			assert.deepEqual(codec.encode(actual), codec.encode(expected));
		}
	});

	describe.skip("Fuzz Test fail cases", () => {
		it("Anchor Stability fails when root node is deleted", async () => {
			const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);

			const rootFieldSchema = SchemaBuilder.fieldValue(Any);
			const testSchemaBuilder = new SchemaBuilder("testSchema");
			const numberSchema = testSchemaBuilder.leaf("Number", ValueSchema.Number);
			const rootNodeSchema = testSchemaBuilder.structRecursive("Node", {
				foo: SchemaBuilder.fieldSequence(numberSchema),
				foo2: SchemaBuilder.fieldSequence(numberSchema),
			});
			const testSchema = testSchemaBuilder.intoDocumentSchema(rootFieldSchema);

			// TODO: if this tests is just about deleting the root, it should use a simpler tree.
			const initialTreeState: JsonableTree = {
				type: rootNodeSchema.name,
				fields: {
					foo: [
						{ type: numberSchema.name, value: 0 },
						{ type: numberSchema.name, value: 1 },
						{ type: numberSchema.name, value: 2 },
					],
					foo2: [
						{ type: numberSchema.name, value: 0 },
						{ type: numberSchema.name, value: 1 },
						{ type: numberSchema.name, value: 2 },
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

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
// TODO: replace use of this with initialize or schematize, and/or move them out of this file and use viewWithContent
function initializeTestTree(
	tree: ISharedTreeView,
	state?: JsonableTree | JsonableTree[],
	schema: SchemaData = wrongSchema,
): void {
	if (state === undefined) {
		tree.storedSchema.update(schema);
		return;
	}

	if (!Array.isArray(state)) {
		initializeTestTree(tree, [state], schema);
	} else {
		tree.storedSchema.update(schema);

		// Apply an edit to the tree which inserts a node with a value
		runSynchronous(tree, () => {
			const writeCursors = state.map(singleTextCursor);
			const field = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			field.insert(0, writeCursors);
		});
	}
}

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function insertFirstNode(branch: ISharedTreeView, value: ContextuallyTypedNodeData): void {
	insert(branch, 0, value);
}

// const testValueSchema = namedTreeSchema({
// 	name: "TestValue",
// 	leafValue: ValueSchema.Serializable,
// });

/**
 * Helper function to insert node at a given index.
 *
 * TODO: delete once the JSON editing API is ready for use.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted nodes.
 */
function insert(
	tree: ISharedTreeView,
	index: number,
	...values: ContextuallyTypedNodeData[]
): void {
	tree.context.root.insertNodes(index, values);
}

/**
 * Reads the last value added by {@link insertFirstNode} if it exists.
 */
function getTestValue({ forest }: ISharedTreeView): TreeValue | undefined {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	if (!readCursor.firstNode()) {
		readCursor.free();
		return undefined;
	}
	const { value } = readCursor;
	readCursor.free();
	return value;
}

/**
 * Reads all values in a tree set by {@link insertFirstNode} in the order they were added (which is the reverse of the tree order).
 */
function getTestValues({ forest }: ISharedTreeView): TreeValue[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const values: TreeValue[] = [];
	if (readCursor.firstNode()) {
		values.unshift(readCursor.value);
		while (readCursor.nextNode()) {
			values.unshift(readCursor.value);
		}
	}
	readCursor.free();
	return values;
}

function remove(tree: ISharedTreeView, index: number, count: number): void {
	runSynchronous(tree, () => {
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
		field.delete(index, count);
	});
}

/**
 * Checks that the root field of the given tree contains nodes with the given values.
 * Fails if the given tree contains fewer or more nodes in the root trait.
 * Fails if the given tree contains nodes with different values in the root trait.
 * Fails if nodes in the root trait have any children or do not unwrap to the provided values.
 *
 * TODO: delete once the JSON reading API is ready for use.
 *
 * @param tree - The tree to verify.
 * @param expected - The expected values for the nodes in the root field of the tree.
 */
function validateRootField(tree: ISharedTreeView, expected: Value[]): void {
	const actual = [...tree.context.root];
	assert.deepEqual(actual, expected);
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
		fn(provider.trees[0].schematize(config));
	});

	it(`${title} (reference view)`, () => {
		fn(viewWithContent(content));
	});

	it(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		fn(provider.trees[0].schematize(config).fork());
	});

	it(`${title} (reference forked view)`, () => {
		fn(viewWithContent(content).fork());
	});
}
