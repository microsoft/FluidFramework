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
import {
	FieldKinds,
	singleTextCursor,
	makeSchemaCodec,
	jsonableTreeFromCursor,
	namedTreeSchema,
	on,
	SchemaBuilder,
	Any,
	emptyField,
} from "../../feature-libraries";
import { brand, fail, TransactionResult } from "../../util";
import {
	SharedTreeTestFactory,
	SummarizeType,
	TestTreeProvider,
	TestTreeProviderLite,
} from "../utils";
import {
	ISharedTree,
	ISharedTreeView,
	SharedTreeFactory,
	createSharedTreeView,
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
	fieldSchema,
	SchemaData,
	ValueSchema,
	AllowedUpdateType,
	LocalCommitSource,
} from "../../core";
import { typeboxValidator } from "../../external-utilities";
import { EditManager } from "../../shared-tree-core";

const schemaCodec = makeSchemaCodec({ jsonValidator: typeboxValidator });

const fooKey: FieldKey = brand("foo");

describe("SharedTree", () => {
	it("reads only one node", () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const provider = new TestTreeProviderLite();
		runSynchronous(provider.trees[0], (t) => {
			const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
			const field = t.editor.sequenceField({ parent: undefined, field: rootFieldKey });
			field.insert(0, writeCursor);
		});

		const { forest } = provider.trees[0];
		const readCursor = forest.allocateCursor();
		moveToDetachedField(forest, readCursor);
		assert(readCursor.firstNode());
		assert.equal(readCursor.nextNode(), false);
		readCursor.free();
	});

	it("can be connected to another tree", async () => {
		const provider = await TestTreeProvider.create(2);
		assert(provider.trees[0].isAttached());
		assert(provider.trees[1].isAttached());

		const value = "42";
		const expectedSchema = schemaCodec.encode(testSchema);

		// Apply an edit to the first tree which inserts a node with a value
		initializeTestTree(provider.trees[0]);
		setTestValue(provider.trees[0], value);

		// Ensure that the first tree has the state we expect
		assert.equal(getTestValue(provider.trees[0]), value);
		assert.equal(schemaCodec.encode(provider.trees[0].storedSchema), expectedSchema);
		// Ensure that the second tree receives the expected state from the first tree
		await provider.ensureSynchronized();
		assert.equal(getTestValue(provider.trees[1]), value);
		// Ensure second tree got the schema from initialization:
		assert.equal(schemaCodec.encode(provider.trees[1].storedSchema), expectedSchema);
		// Ensure that a tree which connects after the edit has already happened also catches up
		const joinedLaterTree = await provider.createTree();
		assert.equal(getTestValue(joinedLaterTree), value);
		// Ensure schema catchup works:
		assert.equal(schemaCodec.encode(provider.trees[1].storedSchema), expectedSchema);
	});

	it("can summarize and load", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;
		const value = 42;
		initializeTestTree(summarizingTree);
		setTestValue(summarizingTree, value);
		await provider.summarize();
		await provider.ensureSynchronized();
		const loadingTree = await provider.createTree();
		assert.equal(getTestValue(loadingTree), value);
		assert.equal(schemaCodec.encode(loadingTree.storedSchema), schemaCodec.encode(testSchema));
	});

	it("can process ops after loading from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const tree1 = provider.trees[0];
		const tree2 = await provider.createTree();
		const tree3 = await provider.createTree();
		const [container1, container2, container3] = provider.containers;

		const schema: SchemaData = {
			treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
			rootFieldSchema:
				// This test requires the use of a sequence field
				fieldSchema(FieldKinds.sequence),
		};
		tree1.storedSchema.update(schema);

		insert(tree1, 0, "Z");
		insert(tree1, 1, "A");
		insert(tree1, 2, "C");

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
		const tree4 = await provider.createTree();

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
		initializeTestTree(summarizingTree, initialState);

		await provider.ensureSynchronized();
		await provider.summarize();

		const loadingTree = await provider.createTree();
		const fooField: FieldKey = brand("foo");

		runSynchronous(summarizingTree, () => {
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
		const onCreate = (tree: ISharedTree) => {
			const schema: SchemaData = {
				treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
				rootFieldSchema:
					// This test requires the use of a sequence field
					fieldSchema(FieldKinds.sequence),
			};
			tree.storedSchema.update(schema);
			insert(tree, 0, "A");
			insert(tree, 1, "C");
			validateRootField(tree, ["A", "C"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			SummarizeType.onDemand,
			new SharedTreeTestFactory(onCreate),
		);
		const [tree1] = provider.trees;
		validateRootField(tree1, ["A", "C"]);
		const tree2 = await provider.createTree();
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
		const [tree1, tree2] = provider.trees;

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
		const t1 = tree1 as unknown as { editManager?: EditManager<any, any, any> };
		const t2 = tree2 as unknown as { editManager?: EditManager<any, any, any> };
		assert(
			t1.editManager !== undefined && t2.editManager !== undefined,
			"EditManager has moved. This test must be updated.",
		);
		assert(t1.editManager.getTrunkChanges().length < 10);
		assert(t2.editManager.getTrunkChanges().length < 10);
	});

	it("can process changes while detached", async () => {
		const onCreate = (t: ISharedTree) => {
			setTestValue(t, "B");
			setTestValue(t, "A");
			validateRootField(t, ["A", "B"]);
		};
		const provider = await TestTreeProvider.create(
			1,
			undefined,
			new SharedTreeTestFactory(onCreate),
		);
		const [tree] = provider.trees;
		validateRootField(tree, ["A", "B"]);
	});

	describe("Editing", () => {
		it("can insert and delete a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);

			provider.processMessages();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);

			// Delete node
			remove(tree1, 0, 1);

			provider.processMessages();

			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);
		});

		it("can handle competing deletes", () => {
			for (const index of [0, 1, 2, 3]) {
				const provider = new TestTreeProviderLite(4);
				const [tree1, tree2, tree3, tree4] = provider.trees;
				const sequence: JsonableTree[] = [
					{ type: brand("Number"), value: 0 },
					{ type: brand("Number"), value: 1 },
					{ type: brand("Number"), value: 2 },
					{ type: brand("Number"), value: 3 },
				];
				initializeTestTree(tree1, sequence);
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
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);

			// Delete node
			runSynchronous(tree1, () => {
				const field = tree1.editor.optionalField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.set(undefined, false);
			});

			provider.processMessages();
			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);

			// Set node
			runSynchronous(tree1, () => {
				const field = tree1.editor.optionalField({
					parent: undefined,
					field: rootFieldKey,
				});
				field.set(singleTextCursor({ type: brand("TestValue"), value: 43 }), true);
			});

			provider.processMessages();
			assert.equal(getTestValue(tree1), 43);
			assert.equal(getTestValue(tree2), 43);
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
			abortTransaction(tree1);
		});

		it("can abandon a transaction on a branch", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree] = provider.trees;
			abortTransaction(tree.fork());
		});

		it("can insert multiple nodes", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

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
			const [tree1, tree2] = provider.trees;

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
			const [tree] = provider.trees;

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
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);
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
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			const initialState: JsonableTree = {
				type: brand("TestValue"),
				value: "A",
			};
			initializeTestTree(tree2, initialState);
			provider.processMessages();

			assert.equal(getTestValue(tree1), "A");

			// Insert node
			insert(tree1, 0, value);
			provider.processMessages();

			const testValuesAfterInsertion = getTestValues(tree1);
			assert.equal(testValuesAfterInsertion[0], "A");
			assert.equal(testValuesAfterInsertion[1], value);

			// Make a remote edit
			remove(tree2, 1, 1);
			provider.processMessages();

			// Validate deletion
			const testValuesAfterDeletion = getTestValues(tree1);
			assert.equal(testValuesAfterDeletion.length, 1);
			assert.equal(testValuesAfterDeletion[0], value);

			// Undo
			tree1.undo();
			// Call undo to ensure it doesn't undo the change from tree2
			tree1.undo();
			provider.processMessages();

			// Validate undo
			assert.equal(getTestValues(tree1).length, 0);
			assert.equal(getTestValues(tree2).length, 0);

			// Call redo
			tree1.redo();
			provider.processMessages();

			// Validate redo
			const testValuesAfterRedo = getTestValues(tree1);
			assert.equal(testValuesAfterRedo.length, 1);
			assert.equal(testValuesAfterRedo[0], value);
		});

		it("the insert of a node in a sequence field", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);
			provider.processMessages();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);

			// Undo node insertion
			tree1.undo();
			provider.processMessages();

			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);

			// Redo node insertion
			tree1.redo();
			provider.processMessages();

			assert.equal(getTestValue(tree1), value);
			assert.equal(getTestValue(tree2), value);
		});

		it("rebased edits", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			const expectedState: JsonableTree[] = stringToJsonableTree(["A", "B", "C", "D"]);
			initializeTestTree(tree1, expectedState);
			provider.processMessages();

			// Validate insertion
			validateTree(tree2, expectedState);

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			validateTree(tree1, stringToJsonableTree(["A", "x", "B", "C", "D"]));

			insert(tree2, 3, "y");
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "y", "D"]));

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			tree1.undo();
			validateTree(tree1, stringToJsonableTree(["A", "B", "C", "y", "D"]));

			tree2.undo();
			validateTree(tree2, stringToJsonableTree(["A", "x", "B", "C", "D"]));

			provider.processMessages();
			validateTree(tree1, expectedState);
			validateTree(tree2, expectedState);

			// Insert additional node at the beginning to require rebasing
			insert(tree1, 0, "0");
			validateTree(tree1, stringToJsonableTree(["0", "A", "B", "C", "D"]));

			const expectedAfterRedo = stringToJsonableTree(["0", "A", "x", "B", "C", "y", "D"]);
			// Redo node insertion on both trees
			tree1.redo();
			validateTree(tree1, stringToJsonableTree(["0", "A", "x", "B", "C", "D"]));

			tree2.redo();
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "y", "D"]));

			provider.processMessages();
			validateTree(tree1, expectedAfterRedo);
			validateTree(tree2, expectedAfterRedo);
		});

		it("updates rebased undoable commits in the correct order", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			// Initialize the tree
			const expectedState: JsonableTree[] = stringToJsonableTree(["A", "B", "C", "D"]);
			initializeTestTree(tree1, expectedState);
			provider.processMessages();

			// Validate initialization
			validateTree(tree2, expectedState);

			// Insert a node on tree 2
			insert(tree2, 4, "z");
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "D", "z"]));

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			validateTree(tree1, stringToJsonableTree(["A", "x", "B", "C", "D"]));

			insert(tree2, 3, "y");
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "y", "D", "z"]));

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			// Undo node insertion on both trees
			tree1.undo();
			validateTree(tree1, stringToJsonableTree(["A", "B", "C", "y", "D", "z"]));

			// First undo should be the insertion of y
			tree2.undo();
			validateTree(tree2, stringToJsonableTree(["A", "x", "B", "C", "D", "z"]));
			tree2.undo();
			validateTree(tree2, stringToJsonableTree(["A", "x", "B", "C", "D"]));

			provider.processMessages();
			validateTree(tree1, expectedState);
			validateTree(tree2, expectedState);

			// Insert additional node at the beginning to require rebasing
			insert(tree1, 0, "0");
			validateTree(tree1, stringToJsonableTree(["0", "A", "B", "C", "D"]));
			provider.processMessages();

			const expectedAfterRedo = stringToJsonableTree([
				"0",
				"A",
				"x",
				"B",
				"C",
				"y",
				"D",
				"z",
			]);

			// Redo node insertion on both trees
			tree1.redo();
			validateTree(tree1, stringToJsonableTree(["0", "A", "x", "B", "C", "D"]));

			// First redo should be the insertion of z
			tree2.redo();
			validateTree(tree2, stringToJsonableTree(["0", "A", "B", "C", "D", "z"]));
			tree2.redo();
			validateTree(tree2, stringToJsonableTree(["0", "A", "B", "C", "y", "D", "z"]));

			provider.processMessages();
			validateTree(tree1, expectedAfterRedo);
			validateTree(tree2, expectedAfterRedo);
		});

		it("an insert after another undo has been sequenced", () => {
			const value = "42";
			const value2 = "43";
			const value3 = "44";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			initializeTestTree(tree1, stringToJsonableTree(["A", "B", "C", "D"]));
			provider.processMessages();

			// Insert node
			insert(tree1, 1, value);
			insert(tree1, 2, value2);

			validateTree(tree1, stringToJsonableTree(["A", value, value2, "B", "C", "D"]));

			insert(tree2, 0, value3);
			validateTree(tree2, stringToJsonableTree([value3, "A", "B", "C", "D"]));

			// Undo insertion of value2
			tree1.undo();

			validateTree(tree1, stringToJsonableTree(["A", value, "B", "C", "D"]));

			// Sequence after the undo to ensure that undo commits are tracked
			// correctly in the trunk undo redo manager and after the and after the insert
			// on tree2 to cause rebasing of the local branch on tree1
			provider.processMessages();

			validateTree(tree1, stringToJsonableTree([value3, "A", value, "B", "C", "D"]));
			validateTree(tree2, stringToJsonableTree([value3, "A", value, "B", "C", "D"]));

			// Undo insertion of value
			tree1.undo();

			validateTree(tree1, stringToJsonableTree([value3, "A", "B", "C", "D"]));

			// Insert another value to cause rebasing
			insert(tree2, 0, value3);
			validateTree(tree2, stringToJsonableTree([value3, value3, "A", value, "B", "C", "D"]));

			provider.processMessages();

			// Redo node insertion
			tree1.redo();
			provider.processMessages();

			validateTree(tree1, stringToJsonableTree([value3, value3, "A", value, "B", "C", "D"]));
			validateTree(tree2, stringToJsonableTree([value3, value3, "A", value, "B", "C", "D"]));
		});
	});

	describe("Events", () => {
		it("triggers events for local and subtree changes", () => {
			const view = testTreeView();
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
			const view = testTreeView();
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
			const [tree1, tree2] = provider.trees;

			const revertibles1: LocalCommitSource[] = [];
			tree1.events.on("revertible", (commitSource) => {
				revertibles1.push(commitSource);
			});

			const revertibles2: LocalCommitSource[] = [];
			tree2.events.on("revertible", (commitSource) => {
				revertibles2.push(commitSource);
			});

			// Insert node
			setTestValue(tree1, "42");
			provider.processMessages();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);
			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, []);

			tree1.undo();
			provider.processMessages();

			// Insert node
			setTestValue(tree2, "43");
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
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1] = provider.trees;
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
			setTestValue(branch, "42");
			provider.processMessages();

			assert.deepEqual(revertibles1, []);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);

			tree1.merge(branch);
			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default]);
		});

		it("doesn't trigger a revertible event for rebases", () => {
			const value = "42";
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			// Initialize the tree
			const expectedState: JsonableTree[] = stringToJsonableTree(["A", "B", "C", "D"]);
			initializeTestTree(tree1, expectedState);
			provider.processMessages();

			// Validate initialization
			validateTree(tree2, expectedState);

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
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "D", "z"]));

			// Insert nodes on both trees
			insert(tree1, 1, "x");
			validateTree(tree1, stringToJsonableTree(["A", "x", "B", "C", "D"]));

			insert(tree2, 3, "y");
			validateTree(tree2, stringToJsonableTree(["A", "B", "C", "y", "D", "z"]));

			// Syncing will cause both trees to rebase their local changes
			provider.processMessages();

			assert.deepEqual(revertibles1, [LocalCommitSource.Default]);
			assert.deepEqual(revertibles2, [LocalCommitSource.Default, LocalCommitSource.Default]);
		});
	});

	describe("Rebasing", () => {
		it("can rebase two inserts", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "y");
			provider.processMessages();

			insert(tree1, 0, "x");
			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");
			provider.processMessages();

			const expected = ["x", "y", "a", "b", "c"];
			validateRootField(tree1, expected);
			validateRootField(tree2, expected);
		});

		it("can rebase delete over move", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

			insert(tree1, 0, "a", "b");
			provider.processMessages();

			// Move b before a
			runSynchronous(tree1, () => {
				tree1.editor.move(
					{ parent: undefined, field: rootFieldKey },
					1,
					1,
					{ parent: undefined, field: rootFieldKey },
					0,
				);
			});

			// Delete b
			remove(tree2, 1, 1);

			provider.processMessages();

			const expected = ["a"];
			validateRootField(tree1, expected);
			validateRootField(tree2, expected);
		});

		it("can rebase delete over cross-field move", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

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
					],
				},
			};
			initializeTestTree(tree1, initialState);
			provider.processMessages();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			// Move bc between d and e.
			runSynchronous(tree1, () => {
				tree1.editor.move(
					{ parent: rootPath, field: brand("foo") },
					1,
					2,
					{ parent: rootPath, field: brand("bar") },
					1,
				);
			});

			// Delete c
			runSynchronous(tree2, () => {
				const field = tree2.editor.sequenceField({ parent: rootPath, field: brand("foo") });
				field.delete(2, 1);
			});

			provider.processMessages();

			const expectedState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [{ type: brand("Node"), value: "a" }],
					bar: [
						{ type: brand("Node"), value: "d" },
						{ type: brand("Node"), value: "b" },
						{ type: brand("Node"), value: "e" },
					],
				},
			};
			validateTree(tree1, [expectedState]);
			validateTree(tree2, [expectedState]);
		});

		it("can rebase cross-field move over delete", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;

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
					],
				},
			};
			initializeTestTree(tree1, initialState);
			provider.processMessages();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};

			// Delete c
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField({ parent: rootPath, field: brand("foo") });
				field.delete(2, 1);
			});

			// Move bc between d and e.
			runSynchronous(tree2, () => {
				tree2.editor.move(
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
						{ type: brand("Node"), value: "e" },
					],
				},
			};
			validateTree(tree1, [expectedState]);
			validateTree(tree2, [expectedState]);
		});

		it("rebases stashed ops with prior state present", async () => {
			const provider = await TestTreeProvider.create(2);
			insert(provider.trees[0], 0, "a");
			await provider.ensureSynchronized();

			const pausedContainer = provider.containers[0];
			const url = (await pausedContainer.getAbsoluteUrl("")) ?? fail("didn't get url");
			const pausedTree = provider.trees[0];
			await provider.opProcessingController.pauseProcessing(pausedContainer);
			insert(pausedTree, 1, "b");
			insert(pausedTree, 2, "c");
			const pendingOps = pausedContainer.closeAndGetPendingLocalState();
			provider.opProcessingController.resumeProcessing();

			const otherLoadedTree = provider.trees[1];
			insert(otherLoadedTree, 0, "d");
			await provider.ensureSynchronized();

			const loader = provider.makeTestLoader();
			const loadedContainer = await loader.resolve({ url }, pendingOps);
			const dataStore = await requestFluidObject<ITestFluidObject>(loadedContainer, "/");
			const tree = await dataStore.getSharedObject<ISharedTree>("TestSharedTree");
			await waitForContainerConnection(loadedContainer, true);
			await provider.ensureSynchronized();
			validateRootField(tree, ["d", "a", "b", "c"]);
			validateRootField(otherLoadedTree, ["d", "a", "b", "c"]);
		});
	});

	describe("Anchors", () => {
		it("Anchors can be created and dereferenced", () => {
			const provider = new TestTreeProviderLite();
			const tree = provider.trees[0];

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
			setTestValue(parent, "parent");
			const child = parent.fork();
			setTestValue(child, "child");
			assert.equal(getTestValue(parent), "parent");
			assert.deepEqual(getTestValues(child), ["parent", "child"]);
		});

		itView("can apply edits without affecting a fork", (parent) => {
			const child = parent.fork();
			assert.equal(getTestValue(parent), undefined);
			assert.equal(getTestValue(child), undefined);
			setTestValue(parent, "root");
			assert.equal(getTestValue(parent), "root");
			assert.equal(getTestValue(child), undefined);
		});

		itView("can merge changes into a parent", (parent) => {
			const child = parent.fork();
			setTestValue(child, "view");
			parent.merge(child);
			assert.equal(getTestValue(parent), "view");
		});

		itView("can rebase over a parent view", (parent) => {
			const child = parent.fork();
			setTestValue(parent, "root");
			assert.equal(getTestValue(child), undefined);
			child.rebaseOnto(parent);
			assert.equal(getTestValue(child), "root");
		});

		itView("can rebase over a child view", (view) => {
			const parent = view.fork();
			setTestValue(parent, "P1");
			const child = parent.fork();
			setTestValue(parent, "P2");
			setTestValue(child, "C1");
			parent.rebaseOnto(child);
			assert.deepEqual(getTestValues(child), ["P1", "C1"]);
			assert.deepEqual(getTestValues(parent), ["P1", "C1", "P2"]);
		});

		itView("merge changes through multiple views", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			setTestValue(viewD, "view");
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
			setTestValue(viewB, "B");
			setTestValue(viewC, "C");
			setTestValue(viewD, "D");
			viewC.merge(viewD);
			assert.equal(getTestValue(viewB), "B");
			assert.equal(getTestValue(viewC), "D");
			viewB.merge(viewC);
			assert.equal(getTestValue(viewB), "D");
		});

		itView("can merge a parent view into a child", (view) => {
			const parent = view.fork();
			setTestValue(parent, "P1");
			const child = parent.fork();
			setTestValue(parent, "P2");
			setTestValue(child, "C1");
			child.merge(parent);
			assert.deepEqual(getTestValues(child), ["P1", "C1", "P2"]);
			assert.deepEqual(getTestValues(parent), ["P1", "P2"]);
		});

		itView("can perform a complicated merge scenario", (viewA) => {
			const viewB = viewA.fork();
			const viewC = viewB.fork();
			const viewD = viewC.fork();
			setTestValue(viewB, "A1");
			setTestValue(viewC, "B1");
			setTestValue(viewD, "C1");
			viewC.merge(viewD);
			setTestValue(viewA, "R1");
			setTestValue(viewB, "A2");
			setTestValue(viewC, "B2");
			viewB.merge(viewC);
			const viewE = viewB.fork();
			setTestValue(viewB, "A3");
			viewE.rebaseOnto(viewB);
			assert.equal(getTestValue(viewE), "A3");
			setTestValue(viewB, "A4");
			setTestValue(viewE, "D1");
			setTestValue(viewA, "R2");
			viewB.merge(viewE);
			viewA.merge(viewB);
			setTestValue(viewA, "R3");
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
			setTestValue(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			setTestValue(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging into a parent", (parent) => {
			setTestValue(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			setTestValue(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after merging a branch into a divergent parent", (parent) => {
			setTestValue(parent, "A");
			let cursor = parent.forest.allocateCursor();
			moveToDetachedField(parent.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			const child = parent.fork();
			setTestValue(parent, "P");
			setTestValue(child, "B");
			parent.merge(child);
			cursor = parent.forest.allocateCursor();
			parent.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("update anchors after undoing", (view) => {
			setTestValue(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			setTestValue(view, "B");
			view.undo();
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("can be mutated after merging", (parent) => {
			const child = parent.fork();
			setTestValue(child, "A");
			parent.merge(child, false);
			setTestValue(child, "B");
			assert.deepEqual(getTestValues(parent), ["A"]);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
			parent.merge(child);
			assert.deepEqual(getTestValues(parent), ["A", "B"]);
		});

		itView("can rebase after merging", (parent) => {
			const child = parent.fork();
			setTestValue(child, "A");
			parent.merge(child, false);
			setTestValue(parent, "B");
			child.rebaseOnto(parent);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
		});

		itView("can be read after merging", (parent) => {
			setTestValue(parent, "root");
			const child = parent.fork();
			parent.merge(child);
			assert.equal(getTestValue(child), "root");
		});

		itView("properly fork the tree schema", (parent) => {
			const schemaA: SchemaData = {
				treeSchema: new Map([]),
				rootFieldSchema: emptyField,
			};
			const schemaB: SchemaData = {
				treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
				rootFieldSchema: emptyField,
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
			const [tree1, tree2] = provider.trees;
			const baseView = tree1.fork();
			const view = baseView.fork();
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			setTestValue(view, "42");
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
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			const baseView = tree1.fork();
			const view = baseView.fork();
			setTestValue(view, "A");
			setTestValue(view, "B");
			baseView.merge(view);
			tree1.merge(baseView);
			provider.processMessages();
			assert.equal(opsReceived, 2);
		});
	});

	describe("Transactions", () => {
		/** like `pushTestValue`, but does not wrap the operation in a transaction */
		function pushTestValueDirect(view: ISharedTreeView, value: TreeValue): void {
			const field = view.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			const nodes = singleTextCursor({ type: brand("Node"), value });
			field.insert(0, nodes);
		}

		itView("update the tree while open", (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			assert.equal(getTestValue(view), 42);
		});

		itView("update the tree after committing", (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("revert the tree after aborting", (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			view.transaction.abort();
			assert.equal(getTestValue(view), undefined);
		});

		itView("can nest", (view) => {
			view.transaction.start();
			pushTestValueDirect(view, "A");
			view.transaction.start();
			pushTestValueDirect(view, "B");
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
			view.transaction.commit();
			assert.deepEqual(getTestValues(view), ["A", "B"]);
		});

		itView("can span a view fork and merge", (view) => {
			view.transaction.start();
			const fork = view.fork();
			pushTestValueDirect(fork, 42);
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
			pushTestValueDirect(fork, 42);
			pushTestValueDirect(fork, 43);
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
			pushTestValueDirect(view, "A");
			fork.transaction.start();
			pushTestValueDirect(view, "B");
			fork.transaction.abort();
			pushTestValueDirect(view, "C");
			view.merge(fork);
			assert.deepEqual(getTestValues(view), ["A", "B", "C"]);
		});

		itView("can handle a pull while in progress", (view) => {
			const fork = view.fork();
			fork.transaction.start();
			setTestValue(view, 42);
			fork.rebaseOnto(view);
			assert.equal(getTestValue(fork), 42);
			fork.transaction.commit();
			assert.equal(getTestValue(fork), 42);
		});

		itView("update anchors correctly", (view) => {
			setTestValue(view, "A");
			let cursor = view.forest.allocateCursor();
			moveToDetachedField(view.forest, cursor);
			cursor.firstNode();
			const anchor = cursor.buildAnchor();
			cursor.clear();
			setTestValue(view, "B");
			cursor = view.forest.allocateCursor();
			view.forest.tryMoveCursorToNode(anchor, cursor);
			assert.equal(cursor.value, "A");
			cursor.clear();
		});

		itView("can handle a complicated scenario", (view) => {
			pushTestValueDirect(view, "A");
			view.transaction.start();
			pushTestValueDirect(view, "B");
			pushTestValueDirect(view, "C");
			view.transaction.start();
			pushTestValueDirect(view, "D");
			const fork = view.fork();
			pushTestValueDirect(fork, "E");
			fork.transaction.start();
			pushTestValueDirect(fork, "F");
			pushTestValueDirect(view, "G");
			fork.transaction.commit();
			pushTestValueDirect(fork, "H");
			fork.transaction.start();
			pushTestValueDirect(fork, "I");
			fork.transaction.abort();
			view.merge(fork);
			pushTestValueDirect(view, "J");
			view.transaction.start();
			const fork2 = view.fork();
			pushTestValueDirect(fork2, "K");
			setTestValue(fork2, "L");
			view.merge(fork2);
			view.transaction.abort();
			pushTestValueDirect(view, "M");
			view.transaction.commit();
			pushTestValueDirect(view, "N");
			view.transaction.commit();
			pushTestValueDirect(view, "O");
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
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			pushTestValueDirect(tree1, 42);
			provider.processMessages();
			assert.equal(opsReceived, 0);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValue(tree2), 42);
		});

		it("send only one op after committing", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			pushTestValueDirect(tree1, 42);
			pushTestValueDirect(tree1, 43);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValues(tree2), [42, 43]);
		});

		it("do not send an op after committing if nested", () => {
			const provider = new TestTreeProviderLite(2);
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			tree1.transaction.start();
			pushTestValueDirect(tree1, 42);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 0);
			assert.deepEqual(getTestValues(tree2), []);
			pushTestValueDirect(tree1, 43);
			tree1.transaction.commit();
			provider.processMessages();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValues(tree2), [42, 43]);
		});

		it("process changes while detached", async () => {
			const onCreate = (parent: ISharedTreeView) => {
				parent.transaction.start();
				pushTestValueDirect(parent, "A");
				parent.transaction.commit();
				parent.transaction.start();
				setTestValue(parent, "B");
				parent.transaction.commit();
				const child = parent.fork();
				child.transaction.start();
				pushTestValueDirect(child, "C");
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
			assert.deepEqual(getTestValues(tree), ["A", "B", "C"]);
		});
	});

	describe.skip("Fuzz Test fail cases", () => {
		it("Anchor Stability fails when root node is deleted", async () => {
			const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
			const initialTreeState: JsonableTree = {
				type: brand("Node"),
				fields: {
					foo: [
						{ type: brand("Number"), value: 0 },
						{ type: brand("Number"), value: 1 },
						{ type: brand("Number"), value: 2 },
					],
					foo2: [
						{ type: brand("Number"), value: 0 },
						{ type: brand("Number"), value: 1 },
						{ type: brand("Number"), value: 2 },
					],
				},
			};
			initializeTestTree(provider.trees[0], initialTreeState, testSchema);
			const tree = provider.trees[0];

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
});

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: brand("TestValue"),
	structFields: {
		optionalChild: fieldSchema(FieldKinds.optional, [brand("TestValue")]),
	},
	mapFields: fieldSchema(FieldKinds.sequence),
	leafValue: ValueSchema.Serializable,
});
const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	rootFieldSchema,
};

function stringToJsonableTree(values: string[]): JsonableTree[] {
	return values.map((value) => {
		return {
			type: brand("TestValue"),
			value,
		};
	});
}

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
	tree: ISharedTreeView,
	state?: JsonableTree | JsonableTree[],
	schema: SchemaData = testSchema,
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

function testTreeView(): ISharedTreeView {
	const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });
	const builder = new SchemaBuilder("testTreeView");
	const numberSchema = builder.leaf("number", ValueSchema.Number);
	const treeSchema = builder.struct("root", {
		x: SchemaBuilder.fieldValue(numberSchema),
	});
	const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
	const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
	return tree.schematize({
		allowedSchemaModifications: AllowedUpdateType.None,
		initialTree: {
			x: 24,
		},
		schema,
	});
}
/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function setTestValue(branch: ISharedTreeView, value: TreeValue): void {
	insert(branch, 0, value);
}

const testValueSchema = namedTreeSchema({
	name: brand("TestValue"),
	leafValue: ValueSchema.Serializable,
});

/**
 * Helper function to insert node at a given index.
 *
 * TODO: delete once the JSON editing API is ready for use.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: ISharedTreeView, index: number, ...values: TreeValue[]): void {
	runSynchronous(tree, () => {
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
		const nodes = values.map((value) =>
			singleTextCursor({ type: testValueSchema.name, value }),
		);
		field.insert(index, nodes);
	});
}

/**
 * Reads the last value added by {@link setTestValue} if it exists.
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
 * Reads all values in a tree set by {@link setTestValue} in the order they were added.
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

function remove(tree: ISharedTree, index: number, count: number): void {
	runSynchronous(tree, () => {
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
		field.delete(index, count);
	});
}

/**
 * Checks that the root field of the given tree contains nodes with the given values.
 * Fails if the given tree contains fewer or more nodes in the root trait.
 * Fails if the given tree contains nodes with different values in the root trait.
 * Does not check if nodes in the root trait have any children.
 *
 * TODO: delete once the JSON reading API is ready for use.
 *
 * @param tree - The tree to verify.
 * @param expected - The expected values for the nodes in the root field of the tree.
 */
function validateRootField(tree: ISharedTreeView, expected: Value[]): void {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	let hasNode = readCursor.firstNode();
	for (const value of expected) {
		assert(hasNode);
		assert.equal(readCursor.value, value);
		hasNode = readCursor.nextNode();
	}
	assert.equal(hasNode, false);
	readCursor.free();
}

function validateTree(tree: ISharedTreeView, expected: JsonableTree[]): void {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	assert.deepEqual(actual, expected);
}

/**
 * Runs the given test function as two tests,
 * one where `view` is the root SharedTree view and the other where `view` is a fork.
 * This is useful for testing because both `SharedTree` and `SharedTreeFork` implement `ISharedTreeView` in different ways.
 */
function itView(title: string, fn: (view: ISharedTreeView) => void): void {
	it(`${title} (root view)`, () => {
		const provider = new TestTreeProviderLite();
		// Test an actual SharedTree...
		fn(provider.trees[0]);
		// ...as well as a reference view
		fn(createSharedTreeView());
	});

	it(`${title} (forked view)`, () => {
		const provider = new TestTreeProviderLite();
		// Test an actual SharedTree fork...
		fn(provider.trees[0].fork());
		// ...as well as a reference fork
		fn(createSharedTreeView().fork());
	});
}
