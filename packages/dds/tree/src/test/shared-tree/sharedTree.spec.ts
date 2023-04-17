/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils";
import {
	FieldKinds,
	singleTextCursor,
	getSchemaString,
	jsonableTreeFromCursor,
	namedTreeSchema,
	on,
	valueSymbol,
	TypedSchema,
	SchemaAware,
} from "../../feature-libraries";
import { brand, TransactionResult } from "../../util";
import { SharedTreeTestFactory, SummarizeType, TestTreeProvider } from "../utils";
import { ISharedTree, ISharedTreeView, SharedTreeFactory, runSynchronous } from "../../shared-tree";
import {
	compareUpPaths,
	FieldKey,
	JsonableTree,
	mapCursorField,
	rootFieldKey,
	rootFieldKeySymbol,
	symbolFromKey,
	TreeValue,
	UpPath,
	Value,
	moveToDetachedField,
	fieldSchema,
	GlobalFieldKey,
	SchemaData,
	EditManager,
	ValueSchema,
	AllowedUpdateType,
} from "../../core";

const fooKey: FieldKey = brand("foo");
const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const globalFieldKeySymbol = symbolFromKey(globalFieldKey);

describe("SharedTree", () => {
	it("reads only one node", async () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const provider = await TestTreeProvider.create(1);
		runSynchronous(provider.trees[0], (t) => {
			const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
			const field = t.editor.sequenceField(undefined, rootFieldKeySymbol);
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
		const expectedSchema = getSchemaString(testSchema);

		// Apply an edit to the first tree which inserts a node with a value
		initializeTestTree(provider.trees[0]);
		setTestValue(provider.trees[0], value);

		// Ensure that the first tree has the state we expect
		assert.equal(getTestValue(provider.trees[0]), value);
		assert.equal(getSchemaString(provider.trees[0].storedSchema), expectedSchema);
		// Ensure that the second tree receives the expected state from the first tree
		await provider.ensureSynchronized();
		assert.equal(getTestValue(provider.trees[1]), value);
		// Ensure second tree got the schema from initialization:
		assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
		// Ensure that a tree which connects after the edit has already happened also catches up
		const joinedLaterTree = await provider.createTree();
		assert.equal(getTestValue(joinedLaterTree), value);
		// Ensure schema catchup works:
		assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
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
		assert.equal(getSchemaString(loadingTree.storedSchema), getSchemaString(testSchema));
	});

	it("can process ops after loading from summary", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const tree1 = provider.trees[0];
		const tree2 = await provider.createTree();
		const tree3 = await provider.createTree();
		const [container1, container2, container3] = provider.containers;

		const schema: SchemaData = {
			treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
			globalFieldSchema: new Map([
				// This test requires the use of a sequence field
				[rootFieldKey, fieldSchema(FieldKinds.sequence)],
			]),
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

	it("can summarize local edits in the attach summary", async () => {
		const onCreate = (tree: ISharedTree) => {
			const schema: SchemaData = {
				treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
				globalFieldSchema: new Map([
					// This test requires the use of a sequence field
					[rootFieldKey, fieldSchema(FieldKinds.sequence)],
				]),
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

	it("has bounded memory growth in EditManager", async () => {
		const provider = await TestTreeProvider.create(2);
		const [tree1, tree2] = provider.trees;

		// Make some arbitrary number of edits
		for (let i = 0; i < 10; ++i) {
			insert(tree1, 0, "");
		}

		await provider.ensureSynchronized();

		// These two edit will have ref numbers that correspond to the last of the above edits
		insert(tree1, 0, "");
		insert(tree2, 0, "");

		// This synchronization point should ensure that both trees see the edits with the higher ref numbers.
		await provider.ensureSynchronized();

		// It's not clear if we'll ever want to expose the EditManager to ISharedTree consumers or
		// if we'll ever expose some memory stats in which the trunk length would be included.
		// If we do then this test should be updated to use that code path.
		const t1 = tree1 as unknown as { editManager?: EditManager<any, any> };
		const t2 = tree2 as unknown as { editManager?: EditManager<any, any> };
		assert(
			t1.editManager !== undefined && t2.editManager !== undefined,
			"EditManager has moved. This test must be updated.",
		);
		assert(t1.editManager.getTrunk().length < 10);
		assert(t2.editManager.getTrunk().length < 10);
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
		it("can insert and delete a node in a sequence field", async () => {
			const value = "42";
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);

			await provider.ensureSynchronized();

			// Validate insertion
			assert.equal(getTestValue(tree2), value);

			// Delete node
			remove(tree1, 0, 1);

			await provider.ensureSynchronized();

			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);
		});

		it("can handle competing deletes", async () => {
			for (const index of [0, 1, 2, 3]) {
				const provider = await TestTreeProvider.create(4);
				const [tree1, tree2, tree3, tree4] = provider.trees;
				const sequence: JsonableTree[] = [
					{ type: brand("Number"), value: 0 },
					{ type: brand("Number"), value: 1 },
					{ type: brand("Number"), value: 2 },
					{ type: brand("Number"), value: 3 },
				];
				initializeTestTree(tree1, sequence);
				await provider.ensureSynchronized();

				remove(tree1, index, 1);
				remove(tree2, index, 1);
				remove(tree3, index, 1);

				await provider.ensureSynchronized();

				const expectedSequence = [0, 1, 2, 3];
				expectedSequence.splice(index, 1);
				validateRootField(tree1, expectedSequence);
				validateRootField(tree2, expectedSequence);
				validateRootField(tree3, expectedSequence);
				validateRootField(tree4, expectedSequence);
			}
		});

		it("can insert and delete a node in an optional field", async () => {
			const value = "42";
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			setTestValue(tree1, value);

			// Delete node
			runSynchronous(tree1, () => {
				const field = tree1.editor.optionalField(undefined, rootFieldKeySymbol);
				field.set(undefined, false);
			});

			await provider.ensureSynchronized();
			assert.equal(getTestValue(tree1), undefined);
			assert.equal(getTestValue(tree2), undefined);

			// Set node
			runSynchronous(tree1, () => {
				const field = tree1.editor.optionalField(undefined, rootFieldKeySymbol);
				field.set(singleTextCursor({ type: brand("TestValue"), value: 43 }), true);
			});

			await provider.ensureSynchronized();
			assert.equal(getTestValue(tree1), 43);
			assert.equal(getTestValue(tree2), 43);
		});

		it("can edit a global field", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert root node
			setTestValue(tree1, 42);

			// Insert child in global field
			runSynchronous(tree1, () => {
				const writeCursor = singleTextCursor({ type: brand("TestValue"), value: 43 });
				const field = tree1.editor.sequenceField(
					{
						parent: undefined,
						parentField: rootFieldKeySymbol,
						parentIndex: 0,
					},
					globalFieldKeySymbol,
				);
				field.insert(0, writeCursor);
			});

			await provider.ensureSynchronized();

			// Validate insertion
			{
				const readCursor = tree2.forest.allocateCursor();
				moveToDetachedField(tree2.forest, readCursor);
				assert(readCursor.firstNode());
				readCursor.enterField(globalFieldKeySymbol);
				assert(readCursor.firstNode());
				const { value } = readCursor;
				assert.equal(value, 43);
				readCursor.free();
			}

			// Delete node
			runSynchronous(tree2, () => {
				const field = tree2.editor.sequenceField(
					{
						parent: undefined,
						parentField: rootFieldKeySymbol,
						parentIndex: 0,
					},
					globalFieldKeySymbol,
				);
				field.delete(0, 1);
			});

			await provider.ensureSynchronized();

			// Validate deletion
			{
				const readCursor = tree2.forest.allocateCursor();
				moveToDetachedField(tree2.forest, readCursor);
				assert(readCursor.firstNode());
				readCursor.enterField(globalFieldKeySymbol);
				assert(!readCursor.firstNode());
			}
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
				const rootField = branch.editor.sequenceField(undefined, rootFieldKeySymbol);
				const root0Path = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};
				const root1Path = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 1,
				};
				const foo0 = branch.editor.sequenceField(root0Path, fooKey);
				const foo1 = branch.editor.sequenceField(root1Path, fooKey);
				branch.editor.setValue(
					{
						parent: root0Path,
						parentField: fooKey,
						parentIndex: 1,
					},
					41,
				);
				branch.editor.setValue(
					{
						parent: root0Path,
						parentField: fooKey,
						parentIndex: 2,
					},
					42,
				);
				branch.editor.setValue(root0Path, "RootValue1");
				foo0.delete(0, 1);
				rootField.insert(0, singleTextCursor({ type: brand("Test") }));
				foo1.delete(0, 1);
				branch.editor.setValue(root1Path, "RootValue2");
				foo1.insert(0, singleTextCursor({ type: brand("Test") }));
				branch.editor.setValue(
					{
						parent: root1Path,
						parentField: fooKey,
						parentIndex: 1,
					},
					82,
				);
				// Aborting the transaction should restore the forest
				return TransactionResult.Abort;
			});

			validateTree(branch, [initialState]);
		}

		it("can abandon a transaction", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1] = provider.trees;
			abortTransaction(tree1);
		});

		it("can abandon a transaction on a branch", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree] = provider.trees;
			abortTransaction(tree.fork());
		});

		it("can insert multiple nodes", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert nodes
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(0, singleTextCursor({ type: brand("Test"), value: 1 }));
			});

			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(1, singleTextCursor({ type: brand("Test"), value: 2 }));
			});

			await provider.ensureSynchronized();

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

		it("can move nodes across fields", async () => {
			const provider = await TestTreeProvider.create(2);
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
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};
				tree1.editor.move(rootPath, brand("foo"), 1, 2, rootPath, brand("bar"), 1);
			});

			await provider.ensureSynchronized();

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

		it("can make multiple moves in a transaction", async () => {
			const provider = await TestTreeProvider.create(1);
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
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			// Perform multiple moves that should each be assigned a unique ID
			runSynchronous(tree, () => {
				tree.editor.move(rootPath, brand("foo"), 0, 1, rootPath, brand("bar"), 0);
				tree.editor.move(rootPath, brand("bar"), 0, 1, rootPath, brand("baz"), 0);
				runSynchronous(tree, () => {
					tree.editor.move(rootPath, brand("baz"), 0, 1, rootPath, brand("qux"), 0);
				});
			});

			const expectedState: JsonableTree = {
				type: brand("Node"),
				fields: {
					qux: [{ type: brand("Node"), value: "a" }],
				},
			};
			await provider.ensureSynchronized();
			validateTree(tree, [expectedState]);
		});
	});

	describe("Events", () => {
		it("triggers events for local and subtree changes", async () => {
			const view = testTreeView();
			const root = view.context.root.getNode(0);
			const log: string[] = [];
			const unsubscribe = root[on]("changing", () => log.push("change"));
			const unsubscribeSubtree = root[on]("subtreeChanging", () => log.push("subtree"));
			const unsubscribeAfter = view.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root[valueSymbol] = 5;
			log.push("editStart");
			root[valueSymbol] = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root[valueSymbol] = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree",
				"change",
				"after",
				"editStart",
				"subtree",
				"change",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});

		it("propagates path and value args for local and subtree changes", async () => {
			const view = testTreeView();
			const root = view.context.root.getNode(0);
			const log: string[] = [];
			const unsubscribe = root[on]("changing", (upPath, val) =>
				log.push(`change-${String(upPath.parentField)}-${upPath.parentIndex}-${val}`),
			);
			const unsubscribeSubtree = root[on]("subtreeChanging", (upPath) =>
				log.push(`subtree-${String(upPath.parentField)}-${upPath.parentIndex}`),
			);
			const unsubscribeAfter = view.events.on("afterBatch", () => log.push("after"));
			log.push("editStart");
			root[valueSymbol] = 5;
			log.push("editStart");
			root[valueSymbol] = 6;
			log.push("unsubscribe");
			unsubscribe();
			unsubscribeSubtree();
			unsubscribeAfter();
			log.push("editStart");
			root[valueSymbol] = 7;

			assert.deepEqual(log, [
				"editStart",
				"subtree-Symbol(rootFieldKey)-0",
				"change-Symbol(rootFieldKey)-0-5",
				"after",
				"editStart",
				"subtree-Symbol(rootFieldKey)-0",
				"change-Symbol(rootFieldKey)-0-6",
				"after",
				"unsubscribe",
				"editStart",
			]);
		});
	});

	describe("Rebasing", () => {
		it("can rebase two inserts", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "y");
			await provider.ensureSynchronized();

			insert(tree1, 0, "x");
			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");
			await provider.ensureSynchronized();

			const expected = ["x", "y", "a", "b", "c"];
			validateRootField(tree1, expected);
			validateRootField(tree2, expected);
		});

		it("can rebase delete over move", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			insert(tree1, 0, "a", "b");
			await provider.ensureSynchronized();

			// Move b before a
			runSynchronous(tree1, () => {
				tree1.editor.move(
					undefined,
					rootFieldKeySymbol,
					1,
					1,
					undefined,
					rootFieldKeySymbol,
					0,
				);
			});

			// Delete b
			remove(tree2, 1, 1);

			await provider.ensureSynchronized();

			const expected = ["a"];
			validateRootField(tree1, expected);
			validateRootField(tree2, expected);
		});

		it("can rebase delete over cross-field move", async () => {
			const provider = await TestTreeProvider.create(2);
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
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			// Move bc between d and e.
			runSynchronous(tree1, () => {
				tree1.editor.move(rootPath, brand("foo"), 1, 2, rootPath, brand("bar"), 1);
			});

			// Delete c
			runSynchronous(tree2, () => {
				const field = tree2.editor.sequenceField(rootPath, brand("foo"));
				field.delete(2, 1);
			});

			await provider.ensureSynchronized();

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

		it.skip("can rebase cross-field move over delete", async () => {
			const provider = await TestTreeProvider.create(2);
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
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			// Delete c
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(rootPath, brand("foo"));
				field.delete(2, 1);
			});

			// Move bc between d and e.
			runSynchronous(tree2, () => {
				tree2.editor.move(rootPath, brand("foo"), 1, 2, rootPath, brand("bar"), 1);
			});

			await provider.ensureSynchronized();

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
	});

	describe("Constraints", () => {
		it("transaction dropped when constraint violated", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "c");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.setValue(rootPath, "b");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["c"]);
			validateRootField(tree2, ["c"]);
		});

		it("transaction successful when constraint not violated", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "a");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.setValue(rootPath, "b");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["b"]);
			validateRootField(tree2, ["b"]);
		});

		it("transaction successful when constraint eventually fixed", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "c");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "d");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "a");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.setValue(rootPath, "b");
			});

			await provider.ensureSynchronized();
			validateRootField(provider.trees[0], ["b"]);
			validateRootField(provider.trees[1], ["b"]);
		});

		it("transaction dropped with violated constraints on different fields", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a", "x");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const rootPath2 = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 1,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "b");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath2, "y");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.addValueConstraint(rootPath2, "x");
				tree1.editor.setValue(rootPath, "c");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["b", "y"]);
			validateRootField(tree2, ["b", "y"]);
		});

		it("transaction successful with constraints eventually fixed on different fields", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a", "x");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const rootPath2 = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 1,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "b");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath2, "y");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "a");
				tree2.editor.setValue(rootPath2, "x");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.addValueConstraint(rootPath2, "x");
				tree1.editor.setValue(rootPath, "c");
			});

			await provider.ensureSynchronized();
			validateRootField(provider.trees[1], ["c", "x"]);
			validateRootField(provider.trees[0], ["c", "x"]);
		});

		it("constraints violated delta is propagated", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a", "x");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const rootPath2 = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 1,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "b");
			});

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath2, "y");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.setValue(rootPath, "c");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["b", "y"]);
			validateRootField(tree2, ["b", "y"]);
		});

		it("uses first defined constraint for node in transaction", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "a");
			});

			runSynchronous(tree1, () => {
				tree1.editor.addValueConstraint(rootPath, "a");
				tree1.editor.addValueConstraint(rootPath, "ignored");
				tree1.editor.setValue(rootPath, "b");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["b"]);
			validateRootField(tree2, ["b"]);
		});

		it("ignores constraint on node after a node is changed in the same transaction", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			insert(tree1, 0, "a");
			await provider.ensureSynchronized();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			runSynchronous(tree2, () => {
				tree2.editor.setValue(rootPath, "a");
			});

			runSynchronous(tree1, () => {
				tree1.editor.setValue(rootPath, "b");
				// This constraint will always be true and should be ignored
				tree1.editor.addValueConstraint(rootPath, "b");
			});

			await provider.ensureSynchronized();
			validateRootField(tree1, ["b"]);
			validateRootField(tree2, ["b"]);
		});
	});

	describe("Anchors", () => {
		it("Anchors can be created and dereferenced", async () => {
			const provider = await TestTreeProvider.create(1);
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
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				},
				parentField: brand("foo"),
				parentIndex: 1,
			};
			assert(compareUpPaths(childPath, expected));
		});
	});

	describe("Views", () => {
		itView("can fork and apply edits without affecting the parent", async (parent) => {
			setTestValue(parent, "parent");
			const child = parent.fork();
			setTestValue(child, "child");
			assert.equal(getTestValue(parent), "parent");
			assert.deepEqual(getTestValues(child), ["parent", "child"]);
		});

		itView("can apply edits without affecting a fork", async (parent) => {
			const child = parent.fork();
			assert.equal(getTestValue(parent), undefined);
			assert.equal(getTestValue(child), undefined);
			setTestValue(parent, "root");
			assert.equal(getTestValue(parent), "root");
			assert.equal(getTestValue(child), undefined);
		});

		itView("can merge changes into a parent", async (parent) => {
			const child = parent.fork();
			setTestValue(child, "view");
			parent.merge(child);
			assert.equal(getTestValue(parent), "view");
		});

		itView("can rebase over a parent view", async (parent) => {
			const child = parent.fork();
			setTestValue(parent, "root");
			assert.equal(getTestValue(child), undefined);
			child.rebaseOnto(parent);
			assert.equal(getTestValue(child), "root");
		});

		itView("can rebase over a child view", async (view) => {
			const parent = view.fork();
			setTestValue(parent, "P1");
			const child = parent.fork();
			setTestValue(parent, "P2");
			setTestValue(child, "C1");
			parent.rebaseOnto(child);
			assert.deepEqual(getTestValues(child), ["P1", "C1"]);
			assert.deepEqual(getTestValues(parent), ["P1", "C1", "P2"]);
		});

		itView("merge changes through multiple views", async (viewA) => {
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

		itView("merge correctly when multiple ancestors are mutated", async (viewA) => {
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

		itView("can merge a parent view into a child", async (view) => {
			const parent = view.fork();
			setTestValue(parent, "P1");
			const child = parent.fork();
			setTestValue(parent, "P2");
			setTestValue(child, "C1");
			child.merge(parent);
			assert.deepEqual(getTestValues(child), ["P1", "C1", "P2"]);
			assert.deepEqual(getTestValues(parent), ["P1", "P2"]);
		});

		itView("can perform a complicated merge scenario", async (viewA) => {
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

		itView("update anchors after applying a change", async (view) => {
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

		itView("update anchors after merging into a parent", async (parent) => {
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

		itView("can be mutated after merging", async (parent) => {
			const child = parent.fork();
			setTestValue(child, "A");
			parent.merge(child);
			setTestValue(child, "B");
			assert.deepEqual(getTestValues(parent), ["A"]);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
			parent.merge(child);
			assert.deepEqual(getTestValues(parent), ["A", "B"]);
		});

		itView("can rebase after merging", async (parent) => {
			const child = parent.fork();
			setTestValue(child, "A");
			parent.merge(child);
			setTestValue(parent, "B");
			child.rebaseOnto(parent);
			assert.deepEqual(getTestValues(child), ["A", "B"]);
		});

		itView("can be read after merging", async (parent) => {
			setTestValue(parent, "root");
			const child = parent.fork();
			parent.merge(child);
			assert.equal(getTestValue(child), "root");
		});

		itView("properly fork the tree schema", async (parent) => {
			const schemaA: SchemaData = {
				treeSchema: new Map([]),
				globalFieldSchema: new Map(),
			};
			const schemaB: SchemaData = {
				treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
				globalFieldSchema: new Map(),
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

		it("submit edits to Fluid when merging into the root view", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			const baseView = tree1.fork();
			const view = baseView.fork();
			// Modify the view, but tree2 should remain unchanged until the edit merges all the way up
			setTestValue(view, "42");
			await provider.ensureSynchronized();
			assert.equal(getTestValue(tree2), undefined);
			baseView.merge(view);
			await provider.ensureSynchronized();
			assert.equal(getTestValue(tree2), undefined);
			tree1.merge(baseView);
			await provider.ensureSynchronized();
			assert.equal(getTestValue(tree2), "42");
		});

		it("do not squash commits", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			const baseView = tree1.fork();
			const view = baseView.fork();
			setTestValue(view, "A");
			setTestValue(view, "B");
			baseView.merge(view);
			tree1.merge(baseView);
			await provider.ensureSynchronized();
			assert.equal(opsReceived, 2);
		});
	});

	describe("Transactions", () => {
		/** like `pushTestValue`, but does not wrap the operation in a transaction */
		function pushTestValueDirect(view: ISharedTreeView, value: TreeValue): void {
			const field = view.editor.sequenceField(undefined, rootFieldKeySymbol);
			const nodes = singleTextCursor({ type: brand("Node"), value });
			field.insert(0, nodes);
		}

		itView("update the tree while open", async (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			assert.equal(getTestValue(view), 42);
		});

		itView("update the tree after committing", async (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("revert the tree after aborting", async (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			view.transaction.abort();
			assert.equal(getTestValue(view), undefined);
		});

		itView("can nest", async (view) => {
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

		itView("can span a view fork and merge", async (view) => {
			view.transaction.start();
			const fork = view.fork();
			pushTestValueDirect(fork, 42);
			view.merge(fork);
			view.transaction.commit();
			assert.equal(getTestValue(view), 42);
		});

		itView("fail if in progress when view merges", async (view) => {
			const fork = view.fork();
			fork.transaction.start();
			assert.throws(
				() => view.merge(fork),
				(e) =>
					validateAssertionError(
						e,
						"Branch may not be merged while transaction is in progress",
					),
			);
		});

		itView("do not close across forks", async (view) => {
			view.transaction.start();
			const fork = view.fork();
			assert.throws(
				() => fork.transaction.commit(),
				(e) => validateAssertionError(e, "No transaction is currently in progress"),
			);
		});

		itView("do not affect pre-existing forks", async (view) => {
			const fork = view.fork();
			pushTestValueDirect(view, "A");
			fork.transaction.start();
			pushTestValueDirect(view, "B");
			fork.transaction.abort();
			pushTestValueDirect(view, "C");
			view.merge(fork);
			assert.deepEqual(getTestValues(view), ["A", "B", "C"]);
		});

		itView("can commit over a branch that pulls", async (view) => {
			view.transaction.start();
			pushTestValueDirect(view, 42);
			const fork = view.fork();
			view.transaction.commit();
			fork.rebaseOnto(view);
			assert.equal(getTestValue(fork), 42);
		});

		itView("can handle a pull while in progress", async (view) => {
			const fork = view.fork();
			fork.transaction.start();
			setTestValue(view, 42);
			fork.rebaseOnto(view);
			assert.equal(getTestValue(fork), 42);
			fork.transaction.commit();
			assert.equal(getTestValue(fork), 42);
		});

		itView("update anchors correctly", async (view) => {
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

		itView("can handle a complicated scenario", async (view) => {
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

		it("don't send ops before committing", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			pushTestValueDirect(tree1, 42);
			await provider.ensureSynchronized();
			assert.equal(opsReceived, 0);
			tree1.transaction.commit();
			await provider.ensureSynchronized();
			assert.equal(opsReceived, 1);
			assert.deepEqual(getTestValue(tree2), 42);
		});

		it("send only one op after committing", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;
			let opsReceived = 0;
			tree2.on("op", () => (opsReceived += 1));
			tree1.transaction.start();
			pushTestValueDirect(tree1, 42);
			pushTestValueDirect(tree1, 43);
			tree1.transaction.commit();
			await provider.ensureSynchronized();
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
		it("Invalid operation", async () => {
			const provider = await TestTreeProvider.create(4, SummarizeType.onDemand);
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
			await provider.ensureSynchronized();

			const tree0 = provider.trees[0];
			const tree1 = provider.trees[1];
			const tree2 = provider.trees[2];

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			let path: UpPath;
			// edit 1
			let readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			let actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			path = {
				parent: rootPath,
				parentField: brand("foo2"),
				parentIndex: 1,
			};
			runSynchronous(tree1, () => {
				tree1.editor.setValue(path, 7419365656138425);
			});
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 2
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree2, () => {
				const field = tree2.editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			// edit 3
			await provider.ensureSynchronized();

			// edit 4
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
			});
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 5
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree2, () => {
				const field = tree2.editor.sequenceField(rootPath, brand("foo"));
				field.delete(1, 1);
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 6
			await provider.ensureSynchronized();

			// edit 7
			await provider.ensureSynchronized();

			// edit 8
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					1,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
			});
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			path = {
				parent: rootPath,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			// edit 9
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree2, () => {
				tree2.editor.setValue(path, -3697253287396999);
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 10
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree0, () => {
				const field = tree0.editor.sequenceField(rootPath, brand("foo"));
				field.delete(1, 1);
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 11
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree1, () => {
				const field = tree1.editor.sequenceField(rootPath, brand("Test"));
				field.delete(0, 1);
			});
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			// edit 12
			await provider.ensureSynchronized();

			// edit 13
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			runSynchronous(tree0, () => {
				const field = tree0.editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
			});
		});
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
					parentField: rootFieldKeySymbol,
				},
				parentField: brand("foo"),
				parentIndex: 1,
			};

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
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
				const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
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
				const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
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
	localFields: {
		optionalChild: fieldSchema(FieldKinds.optional, [brand("TestValue")]),
	},
	extraLocalFields: fieldSchema(FieldKinds.sequence),
	globalFields: [globalFieldKey],
	value: ValueSchema.Serializable,
});
const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	globalFieldSchema: new Map([
		[rootFieldKey, rootFieldSchema],
		[globalFieldKey, globalFieldSchema],
	]),
};

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
			const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
			field.insert(0, writeCursors);
		});
	}
}

const testValueSchema = namedTreeSchema({
	name: brand("TestValue"),
	value: ValueSchema.Serializable,
});

function testTreeView(): ISharedTreeView {
	const factory = new SharedTreeFactory();
	const treeSchema = TypedSchema.tree("root", { value: ValueSchema.Number });
	const schema = SchemaAware.typedSchemaData(
		[[rootFieldKey, TypedSchema.fieldUnrestricted(FieldKinds.optional)]],
		treeSchema,
	);
	const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
	return tree.schematize({
		allowedSchemaModifications: AllowedUpdateType.None,
		initialTree: 24,
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
		readCursor.free();
	}
	return values;
}

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
		const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
		const nodes = values.map((value) =>
			singleTextCursor({ type: testValueSchema.name, value }),
		);
		field.insert(index, nodes);
	});
}

function remove(tree: ISharedTree, index: number, count: number): void {
	runSynchronous(tree, () => {
		const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
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
function itView(title: string, fn: (view: ISharedTreeView) => Promise<void>): void {
	it(`${title} (root view)`, async () => {
		const provider = await TestTreeProvider.create(1);
		await fn(provider.trees[0]);
	});

	it(`${title} (forked view)`, async () => {
		const provider = await TestTreeProvider.create(1);
		await fn(provider.trees[0].fork());
	});
}
