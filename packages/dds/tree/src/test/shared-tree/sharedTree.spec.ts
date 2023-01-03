/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    FieldKinds,
    singleTextCursor,
    getSchemaString,
    jsonableTreeFromCursor,
    emptyField,
    namedTreeSchema,
} from "../../feature-libraries";
import { brand } from "../../util";
import {
    compareUpPaths,
    EmptyKey,
    FieldKey,
    JsonableTree,
    mapCursorField,
    rootFieldKey,
    rootFieldKeySymbol,
    symbolFromKey,
    TreeValue,
    UpPath,
    Value,
} from "../../tree";
import { moveToDetachedField } from "../../forest";
import {
    ITestTreeProvider,
    SharedTreeTestFactory,
    SummarizeType,
    TestTreeProvider,
} from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, GlobalFieldKey, SchemaData, ValueSchema } from "../../schema-stored";

/* eslint-disable import/no-internal-modules */
import { SharedTreeCore } from "../../shared-tree-core";
import { SharedTreeNodeHelper } from "./bubble-bench/SharedTreeNodeHelper";
import { SharedTreeSequenceHelper } from "./bubble-bench/SharedTreeSequenceHelper";
import { AppState } from "./bubble-bench/AppState";
import { Bubblebench } from "./bubble-bench/Bubblebench";
import { Bubble } from "./bubble-bench/Bubble";
import { AppStateSchemaData } from "./bubble-bench/schema";

/* eslint-enable import/no-internal-modules */

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
        initializeTestTreeWithValue(provider.trees[0], value);

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
        initializeTestTreeWithValue(summarizingTree, value);
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
            initializeTestTreeWithValue(tree1, value);

            await provider.ensureSynchronized();

            // Validate insertion
            assert.equal(getTestValue(tree2), value);

            // Delete node
            tree1.runTransaction((forest, editor) => {
                const field = editor.sequenceField(undefined, rootFieldKeySymbol);
                field.delete(0, 1);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();

            assert.equal(getTestValue(tree1), undefined);
            assert.equal(getTestValue(tree2), undefined);
        });

        it("can insert and delete a node in an optional field", async () => {
            const value = "42";
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert node
            initializeTestTreeWithValue(tree1, value);

            // Delete node
            tree1.runTransaction((forest, editor) => {
                const field = editor.optionalField(undefined, rootFieldKeySymbol);
                field.set(undefined, false);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();
            assert.equal(getTestValue(tree1), undefined);
            assert.equal(getTestValue(tree2), undefined);

            // Set node
            tree1.runTransaction((forest, editor) => {
                const field = editor.optionalField(undefined, rootFieldKeySymbol);
                field.set(singleTextCursor({ type: brand("TestValue"), value: 43 }), true);
                return TransactionResult.Apply;
            });

            await provider.ensureSynchronized();
            assert.equal(getTestValue(tree1), 43);
            assert.equal(getTestValue(tree2), 43);
        });

        it("can edit a global field", async () => {
            const provider = await TestTreeProvider.create(2);
            const [tree1, tree2] = provider.trees;

            // Insert root node
            initializeTestTreeWithValue(tree1, 42);

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

        describe("SharedTreeNodeHelper", () => {
            const int32Schema = namedTreeSchema({
                name: brand("Int32"),
                extraLocalFields: emptyField,
                value: ValueSchema.Number,
            });

            const testObjectSchema = namedTreeSchema({
                name: brand("TestSharedTree"),
                localFields: {
                    testField: fieldSchema(FieldKinds.value, [int32Schema.name]),
                },
                extraLocalFields: emptyField,
            });

            const schemaData: SchemaData = {
                treeSchema: new Map([[int32Schema.name, int32Schema]]),
                globalFieldSchema: new Map([
                    [rootFieldKey, fieldSchema(FieldKinds.value, [testObjectSchema.name])],
                ]),
            };

            const testJsonableTree: JsonableTree = {
                type: testObjectSchema.name,
                fields: {
                    testField: [{ type: int32Schema.name, value: 1 }],
                },
            };

            const testFieldKey: FieldKey = brand("testField");
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const expectedInitialNodeValue = testJsonableTree.fields!.testField[0].value;

            it("getFieldValue()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeNode = new SharedTreeNodeHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    [],
                );
                assert.equal(treeNode.getFieldValue(testFieldKey), expectedInitialNodeValue);
            });

            it("setFieldValue()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeNode = new SharedTreeNodeHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    [],
                );
                const originalNodeValue = treeNode.getFieldValue(testFieldKey) as number;
                const newNodeValue = originalNodeValue + 99;
                cursor.free();
                await provider.ensureSynchronized();
                treeNode.setFieldValue(testFieldKey, newNodeValue);
                assert.equal(treeNode.getFieldValue(testFieldKey), newNodeValue);
            });
        });

        describe("SharedTreeSequenceHelper", () => {
            const int32Schema = namedTreeSchema({
                name: brand("Int32Schema"),
                extraLocalFields: emptyField,
                value: ValueSchema.Number,
            });

            const testSequenceMemeberSchema = namedTreeSchema({
                name: brand("testSequenceMemeberSchema"),
                localFields: {
                    testField: fieldSchema(FieldKinds.value, [int32Schema.name]),
                },
                extraLocalFields: emptyField,
            });

            const testSequenceSchema = namedTreeSchema({
                name: brand("testSequenceSchema"),
                localFields: {
                    [EmptyKey]: fieldSchema(FieldKinds.sequence, [testSequenceMemeberSchema.name]),
                },
                extraLocalFields: emptyField,
            });

            const testObjectSchema = namedTreeSchema({
                name: brand("testObjectSchema"),
                localFields: {
                    testSequence: fieldSchema(FieldKinds.sequence, [testSequenceSchema.name]),
                },
                extraLocalFields: emptyField,
            });

            const schemaData: SchemaData = {
                treeSchema: new Map([
                    [int32Schema.name, int32Schema],
                    [testSequenceMemeberSchema.name, testSequenceMemeberSchema],
                    [testSequenceSchema.name, testSequenceSchema],
                    [testObjectSchema.name, testObjectSchema],
                ]),
                globalFieldSchema: new Map([
                    [rootFieldKey, fieldSchema(FieldKinds.value, [testObjectSchema.name])],
                ]),
            };

            const testJsonableTree: JsonableTree = {
                type: testObjectSchema.name,
                fields: {
                    testSequence: [
                        {
                            type: testSequenceMemeberSchema.name,
                            fields: {
                                testField: [{ type: int32Schema.name, value: 1 }],
                            },
                        },
                        {
                            type: testSequenceMemeberSchema.name,
                            fields: {
                                testField: [{ type: int32Schema.name, value: 2 }],
                            },
                        },
                    ],
                },
            };

            const testFieldKey: FieldKey = brand("testField");
            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            const expectedFirstNodeInitialValue =
                testJsonableTree.fields!.testSequence[0]!.fields!.testField[0].value;
            const expectedSecondNodeInitialValue =
                testJsonableTree.fields!.testSequence[1]!.fields!.testField[0].value;
            /* eslint-enable @typescript-eslint/no-non-null-assertion */

            it("getAnchor()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );

                const firstNodeAnchor = treeSequence.getAnchor(0);
                const firstNodeCursor = provider.trees[0].forest.allocateCursor();
                provider.trees[0].forest.tryMoveCursorToNode(firstNodeAnchor, firstNodeCursor);
                firstNodeCursor.enterField(testFieldKey);
                firstNodeCursor.enterNode(0);
                assert.equal(firstNodeCursor.value, expectedFirstNodeInitialValue);

                const secondNodeAnchor = treeSequence.getAnchor(1);
                const secondNodeCursor = provider.trees[0].forest.allocateCursor();
                provider.trees[0].forest.tryMoveCursorToNode(secondNodeAnchor, secondNodeCursor);
                secondNodeCursor.enterField(testFieldKey);
                secondNodeCursor.enterNode(0);
                assert.equal(secondNodeCursor.value, expectedSecondNodeInitialValue);
            });

            it("get()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );

                const firstNode = treeSequence.get(0);
                assert.equal(firstNode.getFieldValue(testFieldKey), expectedFirstNodeInitialValue);
                const secondNode = treeSequence.get(1);
                assert.equal(
                    secondNode.getFieldValue(testFieldKey),
                    expectedSecondNodeInitialValue,
                );
            });

            it("getAllAnchors()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );
                const treeAnchors = treeSequence.getAllAnchors();

                const firstNodeCursor = provider.trees[0].forest.allocateCursor();
                provider.trees[0].forest.tryMoveCursorToNode(treeAnchors[0], firstNodeCursor);
                firstNodeCursor.enterField(testFieldKey);
                firstNodeCursor.enterNode(0);
                assert.equal(firstNodeCursor.value, expectedFirstNodeInitialValue);

                const secondNodeCursor = provider.trees[0].forest.allocateCursor();
                provider.trees[0].forest.tryMoveCursorToNode(treeAnchors[1], secondNodeCursor);
                secondNodeCursor.enterField(testFieldKey);
                secondNodeCursor.enterNode(0);
                assert.equal(secondNodeCursor.value, expectedSecondNodeInitialValue);
            });

            it("getAll()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );
                const treeNodes = treeSequence.getAll();
                assert.equal(treeNodes.length, 2);
                assert.equal(
                    treeNodes[0].getFieldValue(testFieldKey),
                    expectedFirstNodeInitialValue,
                );
                assert.equal(
                    treeNodes[1].getFieldValue(testFieldKey),
                    expectedSecondNodeInitialValue,
                );
            });

            it("length()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );
                assert.equal(treeSequence.length(), 2);
            });

            it("pop()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );
                cursor.free();
                treeSequence.pop();
                await provider.ensureSynchronized();
                assert.equal(treeSequence.length(), 1);
                // confirms removal of node was the one at the last index
                const remainingNode = new SharedTreeNodeHelper(
                    provider.trees[0],
                    treeSequence.getAnchor(0),
                    [],
                );
                assert.equal(
                    remainingNode.getFieldValue(testFieldKey),
                    expectedFirstNodeInitialValue,
                );
            });

            it("push()", async () => {
                const provider = await TestTreeProvider.create(1);
                initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

                // move to root node
                const cursor = provider.trees[0].forest.allocateCursor();
                moveToDetachedField(provider.trees[0].forest, cursor);
                cursor.enterNode(0);

                const treeSequence = new SharedTreeSequenceHelper(
                    provider.trees[0],
                    cursor.buildAnchor(),
                    brand("testSequence"),
                    [],
                );

                cursor.free();
                const initialSequenceLength = treeSequence.length();
                treeSequence.push({
                    type: testSequenceMemeberSchema.name,
                    fields: {
                        testField: [{ type: int32Schema.name, value: 3 }],
                    },
                });
                await provider.ensureSynchronized();
                assert.equal(treeSequence.length(), initialSequenceLength + 1);
                const treeNodeValues = treeSequence
                    .getAll()
                    .map((node) => node.getFieldValue(testFieldKey));
                assert.equal(treeNodeValues[0], expectedFirstNodeInitialValue);
                assert.equal(treeNodeValues[1], expectedSecondNodeInitialValue);
                assert.equal(treeNodeValues[2], 3);
            });
        });

        describe("BubbleBench AppState", () => {
            it("constructor creates a local client and inserts it at the end of the tree client sequence list", async () => {
                const provider = await TestTreeProvider.create(1);
                provider.trees[0].storedSchema.update(AppStateSchemaData);
                new Bubblebench().initializeTree(provider.trees[0]);

                const initialBubblesNum = 2;
                const appState1 = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();
                assert.equal(appState1.clients.length, 1);
                const client1 = appState1.clients[0];
                const client1Id = appState1.clients[0].clientId;
                assert.equal(client1.bubbles.length, initialBubblesNum);
                assert.equal(client1Id, appState1.localClient.clientId);

                const appState2 = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();
                assert.equal(appState2.clients.length, 2);
                const client2 = appState2.clients[1];
                const client2Id = appState2.clients[1].clientId;
                assert.equal(client2.bubbles.length, initialBubblesNum);
                assert.equal(client2Id, appState2.localClient.clientId);
            });

            it("increaseBubbles() - correctly adds bubbles to end of local client bubbles sequence", async () => {
                const provider = await TestTreeProvider.create(1);
                provider.trees[0].storedSchema.update(AppStateSchemaData);
                new Bubblebench().initializeTree(provider.trees[0]);

                const initialBubblesNum = 2;
                const appState = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();
                const client = appState.clients[0];
                assert.equal(appState.clients[0].bubbles.length, initialBubblesNum);

                appState.increaseBubblesT({ x: 99, y: 99, vx: 99, vy: 99, r: 99 });
                await provider.ensureSynchronized();

                const bubbles = client.bubbles;
                assert.equal(bubbles.length, initialBubblesNum + 1);
                assert.equal(bubbles[bubbles.length - 1].x, 99);
            });

            it("decreaseBubbles() - correctly pops bubble from end of local client bubbles sequence", async () => {
                const provider = await TestTreeProvider.create(1);
                provider.trees[0].storedSchema.update(AppStateSchemaData);
                new Bubblebench().initializeTree(provider.trees[0]);

                const initialBubblesNum = 2;
                const appState = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();
                const client = appState.clients[0];
                assert.equal(appState.clients[0].bubbles.length, initialBubblesNum);

                appState.increaseBubblesT({ x: 99, y: 99, vx: 99, vy: 99, r: 99 });
                await provider.ensureSynchronized();
                assert.equal(client.bubbles.length, initialBubblesNum + 1);
                assert.equal(client.bubbles[client.bubbles.length - 1].x, 99);

                appState.decreaseBubbles();
                await provider.ensureSynchronized();
                assert.equal(client.bubbles.length, initialBubblesNum);
                assert.equal(client.bubbles[client.bubbles.length - 1].x, 10);
            });

            it("AppState observes changes in remote clients ", async () => {
                const provider = await TestTreeProvider.create(1);
                provider.trees[0].storedSchema.update(AppStateSchemaData);
                new Bubblebench().initializeTree(provider.trees[0]);

                // 1. create two clients
                const initialBubblesNum = 2;
                const appState1 = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                const appState2 = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();

                // confirm both appState1 and appState2 can see each others clients
                assert.equal(appState1.clients.length, 2);
                assert.equal(appState2.clients.length, 2);
                assert.notEqual(appState1.localClient.clientId, appState2.localClient.clientId);

                // 2. increase bubbles in local client of appState1
                appState1.increaseBubblesT({ x: 99, y: 99, vx: 99, vy: 99, r: 99 });
                appState1.applyEdits();
                await provider.ensureSynchronized();
                assert.equal(appState1.localClient.bubbles.length, initialBubblesNum + 1);
                assert.equal(
                    appState1.localClient.bubbles[appState1.localClient.bubbles.length - 1].x,
                    99,
                );

                // 3. confirm appState2 can see the added bubble in the local client of appState1
                const client1FromAppState2 = appState2.clients[0];
                assert.equal(client1FromAppState2.bubbles.length, initialBubblesNum + 1);
                assert.equal(
                    client1FromAppState2.bubbles[client1FromAppState2.bubbles.length - 1].x,
                    99,
                );

                // 4. decrease bubbles in local client of appState1
                appState1.decreaseBubbles();
                appState1.applyEdits();
                await provider.ensureSynchronized();
                assert.equal(appState1.localClient.bubbles.length, initialBubblesNum);
                assert.equal(
                    appState1.localClient.bubbles[appState1.localClient.bubbles.length - 1].x,
                    10,
                );

                // 5. confirm appState2 noticed the deleted bubble in the local client of appState1
                assert.equal(client1FromAppState2.bubbles.length, initialBubblesNum);
                assert.equal(
                    client1FromAppState2.bubbles[client1FromAppState2.bubbles.length - 1].x,
                    10,
                );

                // -------------- Load Test from AppState1 -------------
                await simulateBubbleBenchClientLogic(appState1, 100, provider);
            });

            it("AppState stashes edits from children and can apply them", async () => {
                const provider = await TestTreeProvider.create(1);
                provider.trees[0].storedSchema.update(AppStateSchemaData);
                new Bubblebench().initializeTree(provider.trees[0]);

                const initialBubblesNum = 2;
                const appState1 = new AppState(provider.trees[0], 640, 480, initialBubblesNum);
                await provider.ensureSynchronized();
                assert.equal(appState1.clients.length, 1);
                const client1 = appState1.clients[0];
                const client1Id = appState1.clients[0].clientId;
                assert.equal(client1.bubbles.length, initialBubblesNum);
                assert.equal(client1Id, appState1.localClient.clientId);

                client1.bubbles[0].x = 55;
                client1.bubbles[0].y = 56;
                client1.bubbles[0].vx = 57;
                client1.bubbles[0].vy = 58;
                client1.bubbles[0].r = 59;

                appState1.applyEdits();
                await provider.ensureSynchronized();

                assert.equal(client1.bubbles[0].x, 55);
                assert.equal(client1.bubbles[0].y, 56);
                assert.equal(client1.bubbles[0].vx, 57);
                assert.equal(client1.bubbles[0].vy, 58);
                assert.equal(client1.bubbles[0].r, 59);
            });
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
});

// Simulates the client logic of the bubble bench react application
// (see experimental/examples/bubblebench/common/src/view/app.tsx)
async function simulateBubbleBenchClientLogic(
    appState: AppState,
    iterations: number,
    provider: ITestTreeProvider,
) {
    for (let frame = 0; frame < iterations; frame++) {
        const startTime = Date.now();

        // 1. Move each bubble
        const localBubbles = appState.localClient.bubbles;
        for (const bubble of localBubbles) {
            move(bubble, appState.width, appState.height);
        }

        // 2. Handle collisions between each pair of local bubbles
        for (let i = 0; i < localBubbles.length; i++) {
            const left = localBubbles[i];
            for (let j = i + 1; j < localBubbles.length; j++) {
                const right = localBubbles[j];
                collide(left, right);
            }
        }

        // 3. Handle collisions between local bubbles and remote bubbles (but not between pairs
        // of remote bubbles.)
        for (const client of appState.clients) {
            if (client.clientId === appState.localClient.clientId) {
                continue;
            }
            for (const right of client.bubbles) {
                for (const left of localBubbles) {
                    collide(left, right);
                }
            }
        }

        const executionTimeMs = startTime - Date.now();
        const twentyTwoFPSRemainder = 45.45 - executionTimeMs;
        if (twentyTwoFPSRemainder > 0) {
            // The iteration "frame" completed faster than required to reach 22FPS
            appState.increaseBubblesT({
                x: getRandomInt(0, 99),
                y: getRandomInt(0, 99),
                vx: getRandomInt(0, 99),
                vy: getRandomInt(0, 99),
                r: getRandomInt(0, 99),
            });
        } else {
            // The iteration "frame" completed slower than required to reach 22FPS
            appState.decreaseBubbles();
        }

        appState.applyEdits();
        await provider.ensureSynchronized();
    }
}

function move(bubble: Bubble, width: number, height: number) {
    let { x, y } = bubble;
    const { vx, vy, r } = bubble;

    bubble.x = x += vx;
    bubble.y = y += vy;

    // Reflect Bubbles off walls.
    if (vx < 0 && x < r) {
        bubble.vx = -vx;
    } else if (vx > 0 && x > width - r) {
        bubble.vx = -vx;
    }

    if (vy < 0 && y < r) {
        bubble.vy = -vy;
    } else if (vy > 0 && y > height - r) {
        bubble.vy = -vy;
    }
}

function collide(left: Bubble, right: Bubble): void {
    const dx = left.x - right.x;
    const dy = left.y - right.y;
    const distance2 = dx * dx + dy * dy;

    const threshold = left.r + right.r;
    const threshold2 = threshold * threshold;

    // Reject bubbles whose centers are too far away to be touching.
    if (distance2 > threshold2) {
        return;
    }

    const { vx: lvx, vy: lvy } = left;
    const { vx: rvx, vy: rvy } = right;

    const dvx = lvx - rvx;
    const dvy = lvy - rvy;
    let impulse = dvx * dx + dvy * dy;

    // Reject bubbles that are traveling in the same direction.
    if (impulse > 0) {
        return;
    }

    impulse /= distance2;

    left.vx = lvx - dx * impulse;
    left.vy = lvy - dy * impulse;
    right.vx = rvx + dx * impulse;
    right.vy = rvy + dy * impulse;
}

function getRandomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
}

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
    tree: ISharedTree,
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
 * Use {@link getTestValue} to read the value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    initializeTestTree(tree, { type: brand("TestValue"), value });
}

/**
 * Reads a value in a tree set by {@link initializeTestTreeWithValue} if it exists.
 */
function getTestValue({ forest }: ISharedTree): TreeValue | undefined {
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
 * Helper function to insert node at a given index.
 *
 * TODO: delete once the JSON editing API is ready for use.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: ISharedTree, index: number, ...values: string[]): void {
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
function validateRootField(tree: ISharedTree, expected: Value[]): void {
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

function validateTree(tree: ISharedTree, expected: JsonableTree[]): void {
    const readCursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, readCursor);
    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
    readCursor.free();
    assert.deepEqual(actual, expected);
}
