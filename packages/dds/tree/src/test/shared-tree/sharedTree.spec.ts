/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	FieldKinds,
	singleTextCursor,
	getSchemaString,
	jsonableTreeFromCursor,
	namedTreeSchema,
	IDefaultEditBuilder,
} from "../../feature-libraries";
import { brand } from "../../util";
import { SharedTreeTestFactory, SummarizeType, TestTreeProvider } from "../utils";
import { ISharedTree, ISharedTreeCheckout } from "../../shared-tree";
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
	TransactionResult,
	fieldSchema,
	GlobalFieldKey,
	SchemaData,
	IForestSubscription,
} from "../../core";
import { SharedTreeCore } from "../../shared-tree-core";
import { checkTreesAreSynchronized } from "./sharedTreeFuzzTests";

const fooKey: FieldKey = brand("foo");
const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const globalFieldKeySymbol = symbolFromKey(globalFieldKey);

describe("SharedTree", () => {
	it("reads only one node", async () => {
		// This is a regression test for a scenario in which a transaction would apply its delta twice,
		// inserting two nodes instead of just one
		const provider = await TestTreeProvider.create(1);
		provider.trees[0].runTransaction((f, editor) => {
			const writeCursor = singleTextCursor({ type: brand("LonelyNode") });
			const field = editor.sequenceField(undefined, rootFieldKeySymbol);
			field.insert(0, writeCursor);

			return TransactionResult.Apply;
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
		pushTestValue(provider.trees[0], value);

		// Ensure that the first tree has the state we expect
		assert.equal(peekTestValue(provider.trees[0]), value);
		assert.equal(getSchemaString(provider.trees[0].storedSchema), expectedSchema);
		// Ensure that the second tree receives the expected state from the first tree
		await provider.ensureSynchronized();
		assert.equal(peekTestValue(provider.trees[1]), value);
		// Ensure second tree got the schema from initialization:
		assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
		// Ensure that a tree which connects after the edit has already happened also catches up
		const joinedLaterTree = await provider.createTree();
		assert.equal(peekTestValue(joinedLaterTree), value);
		// Ensure schema catchup works:
		assert.equal(getSchemaString(provider.trees[1].storedSchema), expectedSchema);
	});

	it("can summarize and load", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const [summarizingTree] = provider.trees;
		const value = 42;
		pushTestValue(summarizingTree, value);
		await provider.summarize();
		await provider.ensureSynchronized();
		const loadingTree = await provider.createTree();
		assert.equal(peekTestValue(loadingTree), value);
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
		tree2.runTransaction((forest, editor) => {
			const field = editor.sequenceField(undefined, rootFieldKeySymbol);
			field.delete(0, 1);
			return TransactionResult.Apply;
		});

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
		const t1 = tree1 as unknown as SharedTreeCore<unknown, any, any>;
		const t2 = tree2 as unknown as SharedTreeCore<unknown, any, any>;
		assert(t1.editManager.getTrunk().length < 10);
		assert(t2.editManager.getTrunk().length < 10);
	});

	describe("Editing", () => {
		it("can insert and delete a node in a sequence field", async () => {
			const value = "42";
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			pushTestValue(tree1, value);

			await provider.ensureSynchronized();

			// Validate insertion
			assert.equal(peekTestValue(tree2), value);

			// Delete node
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.delete(0, 1);
				return TransactionResult.Apply;
			});

			await provider.ensureSynchronized();

			assert.equal(peekTestValue(tree1), undefined);
			assert.equal(peekTestValue(tree2), undefined);
		});

		it("can insert and delete a node in an optional field", async () => {
			const value = "42";
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert node
			pushTestValue(tree1, value);

			// Delete node
			tree1.runTransaction((forest, editor) => {
				const field = editor.optionalField(undefined, rootFieldKeySymbol);
				field.set(undefined, false);
				return TransactionResult.Apply;
			});

			await provider.ensureSynchronized();
			assert.equal(peekTestValue(tree1), undefined);
			assert.equal(peekTestValue(tree2), undefined);

			// Set node
			tree1.runTransaction((forest, editor) => {
				const field = editor.optionalField(undefined, rootFieldKeySymbol);
				field.set(singleTextCursor({ type: brand("TestValue"), value: 43 }), true);
				return TransactionResult.Apply;
			});

			await provider.ensureSynchronized();
			assert.equal(peekTestValue(tree1), 43);
			assert.equal(peekTestValue(tree2), 43);
		});

		it("can edit a global field", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert root node
			pushTestValue(tree1, 42);

			// Insert child in global field
			tree1.runTransaction((forest, editor) => {
				const writeCursor = singleTextCursor({ type: brand("TestValue"), value: 43 });
				const field = editor.sequenceField(
					{
						parent: undefined,
						parentField: rootFieldKeySymbol,
						parentIndex: 0,
					},
					globalFieldKeySymbol,
				);
				field.insert(0, writeCursor);

				return TransactionResult.Apply;
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
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(
					{
						parent: undefined,
						parentField: rootFieldKeySymbol,
						parentIndex: 0,
					},
					globalFieldKeySymbol,
				);
				field.delete(0, 1);
				return TransactionResult.Apply;
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

		it("can abandon a transaction", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1] = provider.trees;

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
			initializeTestTree(tree1, initialState);
			tree1.runTransaction((forest, editor) => {
				const rootField = editor.sequenceField(undefined, rootFieldKeySymbol);
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
				const foo0 = editor.sequenceField(root0Path, fooKey);
				const foo1 = editor.sequenceField(root1Path, fooKey);
				editor.setValue(
					{
						parent: root0Path,
						parentField: fooKey,
						parentIndex: 1,
					},
					41,
				);
				editor.setValue(
					{
						parent: root0Path,
						parentField: fooKey,
						parentIndex: 2,
					},
					42,
				);
				editor.setValue(root0Path, "RootValue1");
				foo0.delete(0, 1);
				rootField.insert(0, singleTextCursor({ type: brand("Test") }));
				foo1.delete(0, 1);
				editor.setValue(root1Path, "RootValue2");
				foo1.insert(0, singleTextCursor({ type: brand("Test") }));
				editor.setValue(
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

			validateTree(tree1, [initialState]);
		});

		it("can insert multiple nodes", async () => {
			const provider = await TestTreeProvider.create(2);
			const [tree1, tree2] = provider.trees;

			// Insert nodes
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(0, singleTextCursor({ type: brand("Test"), value: 1 }));
				return TransactionResult.Apply;
			});

			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(1, singleTextCursor({ type: brand("Test"), value: 2 }));
				return TransactionResult.Apply;
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

			tree1.runTransaction((forest, editor) => {
				const rootPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};
				editor.move(rootPath, brand("foo"), 1, 2, rootPath, brand("bar"), 1);
				return TransactionResult.Apply;
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
			tree1.runTransaction((forest, editor) => {
				editor.move(undefined, rootFieldKeySymbol, 1, 1, undefined, rootFieldKeySymbol, 0);
				return TransactionResult.Apply;
			});

			// Delete b
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.delete(1, 1);
				return TransactionResult.Apply;
			});

			await provider.ensureSynchronized();

			const expected = ["a"];
			validateRootField(tree1, expected);
			validateRootField(tree2, expected);
		});

		it.skip("can rebase delete over cross-field move", async () => {
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
			tree1.runTransaction((forest, editor) => {
				editor.move(rootPath, brand("foo"), 1, 2, rootPath, brand("bar"), 1);
				return TransactionResult.Apply;
			});

			// Delete c
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("foo"));
				field.delete(2, 1);
				return TransactionResult.Apply;
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

	describe("Checkouts", () => {
		it("are isolated from the root checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			pushTestValue(tree, "root");
			const checkout = tree.fork();
			pushTestValue(checkout, "checkout");
			assert.equal(peekTestValue(tree), "root");
			assert.equal(peekTestValue(checkout), "checkout");
		});

		it("are isolated from their base checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const baseCheckout = tree.fork();
			pushTestValue(baseCheckout, "base");
			const checkout = baseCheckout.fork();
			pushTestValue(checkout, "checkout");
			assert.equal(peekTestValue(baseCheckout), "base");
			assert.equal(peekTestValue(checkout), "checkout");
		});

		it("provide isolation from the root checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkout = tree.fork();
			assert.equal(peekTestValue(tree), undefined);
			assert.equal(peekTestValue(checkout), undefined);
			pushTestValue(tree, "root");
			assert.equal(peekTestValue(tree), "root");
			assert.equal(peekTestValue(checkout), undefined);
		});

		it("provide isolation from their base checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const baseCheckout = tree.fork();
			const checkout = baseCheckout.fork();
			assert.equal(peekTestValue(baseCheckout), undefined);
			assert.equal(peekTestValue(checkout), undefined);
			pushTestValue(baseCheckout, "base");
			assert.equal(peekTestValue(baseCheckout), "base");
			assert.equal(peekTestValue(checkout), undefined);
		});

		it("merge changes into the root checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkout = tree.fork();
			pushTestValue(checkout, "checkout");
			checkout.merge();
			assert.equal(peekTestValue(tree), "checkout");
		});

		it("merge changes into their base checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const baseCheckout = tree.fork();
			const checkout = baseCheckout.fork();
			pushTestValue(checkout, "checkout");
			checkout.merge();
			assert.equal(peekTestValue(baseCheckout), "checkout");
		});

		it("merge changes through multiple checkouts", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkoutA = tree.fork();
			const checkoutB = checkoutA.fork();
			const checkoutC = checkoutB.fork();
			pushTestValue(checkoutC, "checkout");
			checkoutC.merge();
			assert.equal(peekTestValue(checkoutA), undefined);
			assert.equal(peekTestValue(checkoutB), "checkout");
			checkoutB.merge();
			assert.equal(peekTestValue(checkoutA), "checkout");
			assert.equal(peekTestValue(checkoutB), "checkout");
		});

		it("merge correctly when multiple ancestors are mutated", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkoutA = tree.fork();
			const checkoutB = checkoutA.fork();
			const checkoutC = checkoutB.fork();
			pushTestValue(checkoutA, "A");
			pushTestValue(checkoutB, "B");
			pushTestValue(checkoutC, "C");

			checkoutC.merge();
			assert.equal(peekTestValue(checkoutA), "A");
			assert.equal(peekTestValue(checkoutB), "C");
			checkoutB.merge();
			assert.equal(peekTestValue(checkoutA), "C");
		});

		it("can perform a complicated merge scenario", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkoutA = tree.fork();
			const checkoutB = checkoutA.fork();
			const checkoutC = checkoutB.fork();
			pushTestValue(checkoutA, "A1");
			pushTestValue(checkoutB, "B1");
			pushTestValue(checkoutC, "C1");
			checkoutC.merge();
			pushTestValue(tree, "R1");
			pushTestValue(checkoutA, "A2");
			pushTestValue(checkoutB, "B2");
			checkoutB.merge();
			const checkoutD = checkoutA.fork();
			pushTestValue(checkoutA, "A3");
			checkoutD.pull();
			assert.equal(peekTestValue(checkoutD), "A3");
			pushTestValue(checkoutA, "A4");
			pushTestValue(checkoutD, "D1");
			pushTestValue(tree, "R2");
			checkoutD.merge();
			checkoutA.merge();
			pushTestValue(tree, "R3");
			assert.deepEqual(
				[...getTestValues(tree)],
				["R1", "R2", "A1", "A2", "B1", "C1", "B2", "A3", "A4", "D1", "R3"].reverse(),
			);
		});

		it("can pull changes in from the root checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkout = tree.fork();
			pushTestValue(tree, "root");
			assert.equal(peekTestValue(checkout), undefined);
			checkout.pull();
			assert.equal(peekTestValue(checkout), "root");
		});

		it("can pull changes in from a base checkout", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const baseCheckout = tree.fork();
			const checkout = baseCheckout.fork();
			pushTestValue(baseCheckout, "base");
			assert.equal(peekTestValue(checkout), undefined);
			checkout.pull();
			assert.equal(peekTestValue(checkout), "base");
		});

		it("are disposed after merging", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkoutA = tree.fork();
			const checkoutB = checkoutA.fork();
			const checkoutC = checkoutB.fork();
			assert.equal(checkoutA.isMerged(), false);
			assert.equal(checkoutB.isMerged(), false);
			assert.equal(checkoutC.isMerged(), false);
			checkoutA.merge();
			assert.equal(checkoutA.isMerged(), true);
			assert.equal(checkoutB.isMerged(), true);
			assert.equal(checkoutC.isMerged(), true);
		});

		it("can be read after disposal", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			pushTestValue(tree, "root");
			const checkout = tree.fork();
			checkout.merge();
			assert.equal(peekTestValue(checkout), "root");
		});

		it("cannot be mutated after disposal", async () => {
			const provider = await TestTreeProvider.create(1);
			const [tree] = provider.trees;
			const checkout = tree.fork();
			checkout.merge();
			const expectedError = "Branch is already merged";
			assert.throws(
				() => checkout.pull(),
				(e) => validateAssertionError(e, expectedError),
			);
			assert.throws(
				() => checkout.fork(),
				(e) => validateAssertionError(e, expectedError),
			);
			assert.throws(
				() => checkout.merge(),
				(e) => validateAssertionError(e, expectedError),
			);
			assert.throws(
				() => pushTestValue(checkout, "unused"),
				(e) => validateAssertionError(e, expectedError),
			);
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
			tree1.runTransaction((forest, editor) => {
				editor.setValue(path, 7419365656138425);
				return TransactionResult.Apply;
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
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
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
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
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
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("foo"));
				field.delete(1, 1);
				return TransactionResult.Apply;
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
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					1,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
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
			tree2.runTransaction((forest, editor) => {
				editor.setValue(path, -3697253287396999);
				return TransactionResult.Apply;
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
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("foo"));
				field.delete(1, 1);
				return TransactionResult.Apply;
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
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.delete(0, 1);
				return TransactionResult.Apply;
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
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
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
			tree.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
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
			tree.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
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
		it("ensureSynchronized shows diverged trees", async () => {
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
			await provider.ensureSynchronized();

			// edit 2
			let readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			let actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					1,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 3
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 4
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 5
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree1.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 6
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 7
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 8
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.delete(0, 1);
				return TransactionResult.Apply;
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 9
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			// eslint-disable-next-line prefer-const
			path = {
				parent: rootPath,
				parentField: brand("Test"),
				parentIndex: 0,
			};
			tree0.runTransaction((forest, editor) => {
				editor.setValue(path, 3969223090210651);
				return TransactionResult.Apply;
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 10
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree0.runTransaction((forest, editor) => {
				const field = editor.sequenceField(rootPath, brand("Test"));
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree0.forest.allocateCursor();
			moveToDetachedField(tree0.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 10
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();
			tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.insert(
					0,
					singleTextCursor({ type: brand("Test"), value: -9007199254740991 }),
				);
				return TransactionResult.Apply;
			});
			readCursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, readCursor);
			actual = mapCursorField(readCursor, jsonableTreeFromCursor);
			readCursor.free();

			// edit 11
			await provider.ensureSynchronized();

			checkTreesAreSynchronized(provider);
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
	tree: ISharedTreeCheckout,
	state: JsonableTree,
	schema: SchemaData = testSchema,
): void {
	tree.storedSchema.update(schema);

	// Apply an edit to the tree which inserts a node with a value
	tree.runTransaction((forest, editor) => {
		const writeCursor = singleTextCursor(state);
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.insert(0, writeCursor);

		return TransactionResult.Apply;
	});
}

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link peekTestValue} to read the value.
 */
function pushTestValue(tree: ISharedTreeCheckout, value: TreeValue): void {
	tree.runTransaction((_: IForestSubscription, editor: IDefaultEditBuilder) => {
		const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.insert(0, writeCursor);
		return TransactionResult.Apply;
	});
}

/**
 * Reads a value in a tree set by {@link pushTestValue} if it exists.
 */
function peekTestValue({ forest }: ISharedTreeCheckout): TreeValue | undefined {
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
 * Reads a value in a tree set by {@link pushTestValue} if it exists.
 */
function* getTestValues({ forest }: ISharedTreeCheckout): Iterable<TreeValue> {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	if (readCursor.firstNode()) {
		yield readCursor.value;
		while (readCursor.nextNode()) {
			yield readCursor.value;
		}
		readCursor.free();
	}
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
function insert(tree: ISharedTreeCheckout, index: number, ...values: string[]): void {
	tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		const nodes = values.map((value) => singleTextCursor({ type: brand("Node"), value }));
		field.insert(index, nodes);
		return TransactionResult.Apply;
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
function validateRootField(tree: ISharedTreeCheckout, expected: Value[]): void {
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

function validateTree(tree: ISharedTreeCheckout, expected: JsonableTree[]): void {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	assert.deepEqual(actual, expected);
}
