/* eslint-disable import/no-internal-modules */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    brand,
    EmptyKey,
    FieldKey,
    ISharedTree,
    JsonableTree,
    rootFieldKey,
    TransactionResult,
} from "@fluid-internal/tree";
import {
    fieldSchema,
    GlobalFieldKey,
    namedTreeSchema,
    SchemaData,
    ValueSchema,
} from "@fluid-internal/tree/dist/schema-stored";
import {
    emptyField,
    FieldKinds,
    singleTextCursor,
} from "@fluid-internal/tree/dist/feature-libraries";
import { detachedFieldAsKey } from "@fluid-internal/tree/dist/tree";
import { TestTreeProvider } from "../utils";
import { SharedTreeSequenceHelper } from "../SharedTreeSequenceHelper";
import { SharedTreeNodeHelper } from "../SharedTreeNodeHelper";
// import { AppState } from "../AppState";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

describe("SharedTree", () => {
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
                [
                    rootFieldKey,
                    fieldSchema(FieldKinds.value, [testObjectSchema.name]),
                ],
            ]),
        };

        const testJsonableTree: JsonableTree = {
            type: testObjectSchema.name,
            fields: {
                testField: [{ type: int32Schema.name, value: 1 }],
            },
        };

        const testFieldKey: FieldKey = brand("testField");
        const expectedInitialNodeValue =
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            testJsonableTree.fields!.testField[0].value;

        it("getFieldValue()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeNode = new SharedTreeNodeHelper(
                provider.trees[0],
                cursor.buildAnchor(),
            );
            assert.equal(
                treeNode.getFieldValue(testFieldKey),
                expectedInitialNodeValue,
            );
        });

        it("setFieldValue()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeNode = new SharedTreeNodeHelper(
                provider.trees[0],
                cursor.buildAnchor(),
            );
            const originalNodeValue = treeNode.getFieldValue(
                testFieldKey,
            ) as number;
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
                [EmptyKey]: fieldSchema(FieldKinds.sequence, [
                    testSequenceMemeberSchema.name,
                ]),
            },
            extraLocalFields: emptyField,
        });

        const testObjectSchema = namedTreeSchema({
            name: brand("testObjectSchema"),
            localFields: {
                testSequence: fieldSchema(FieldKinds.sequence, [
                    testSequenceSchema.name,
                ]),
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
                [
                    rootFieldKey,
                    fieldSchema(FieldKinds.value, [testObjectSchema.name]),
                ],
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
            testJsonableTree.fields!.testSequence[0]!.fields!.testField[0]
                .value;
        const expectedSecondNodeInitialValue =
            testJsonableTree.fields!.testSequence[1]!.fields!.testField[0]
                .value;
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        it("getAnchor()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
            );

            const firstNodeAnchor = treeSequence.getAnchor(0);
            const firstNodeCursor = provider.trees[0].forest.allocateCursor();
            provider.trees[0].forest.tryMoveCursorTo(
                firstNodeAnchor,
                firstNodeCursor,
            );
            firstNodeCursor.enterField(testFieldKey);
            firstNodeCursor.enterNode(0);
            assert.equal(firstNodeCursor.value, expectedFirstNodeInitialValue);

            const secondNodeAnchor = treeSequence.getAnchor(1);
            const secondNodeCursor = provider.trees[0].forest.allocateCursor();
            provider.trees[0].forest.tryMoveCursorTo(
                secondNodeAnchor,
                secondNodeCursor,
            );
            secondNodeCursor.enterField(testFieldKey);
            secondNodeCursor.enterNode(0);
            assert.equal(
                secondNodeCursor.value,
                expectedSecondNodeInitialValue,
            );
        });

        it("get()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
            );

            const firstNode = treeSequence.get(0);
            assert.equal(
                firstNode.getFieldValue(testFieldKey),
                expectedFirstNodeInitialValue,
            );
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
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
            );
            const treeAnchors = treeSequence.getAllAnchors();

            const firstNodeCursor = provider.trees[0].forest.allocateCursor();
            provider.trees[0].forest.tryMoveCursorTo(
                treeAnchors[0],
                firstNodeCursor,
            );
            firstNodeCursor.enterField(testFieldKey);
            firstNodeCursor.enterNode(0);
            assert.equal(firstNodeCursor.value, expectedFirstNodeInitialValue);

            const secondNodeCursor = provider.trees[0].forest.allocateCursor();
            provider.trees[0].forest.tryMoveCursorTo(
                treeAnchors[1],
                secondNodeCursor,
            );
            secondNodeCursor.enterField(testFieldKey);
            secondNodeCursor.enterNode(0);
            assert.equal(
                secondNodeCursor.value,
                expectedSecondNodeInitialValue,
            );
        });

        it("getAll()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
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
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
            );
            assert.equal(treeSequence.length(), 2);
        });

        it("pop()", async () => {
            const provider = await TestTreeProvider.create(1);
            initializeTestTree(provider.trees[0], testJsonableTree, schemaData);

            // move to root node
            const cursor = provider.trees[0].forest.allocateCursor();
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
            );
            cursor.free();
            treeSequence.pop();
            await provider.ensureSynchronized();
            assert.equal(treeSequence.length(), 1);
            // confirms removal of node was the one at the last index
            const remainingNode = new SharedTreeNodeHelper(
                provider.trees[0],
                treeSequence.getAnchor(0),
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
            const destination = provider.trees[0].forest.root(
                provider.trees[0].forest.rootField,
            );
            provider.trees[0].forest.tryMoveCursorTo(destination, cursor);

            const treeSequence = new SharedTreeSequenceHelper(
                provider.trees[0],
                cursor.buildAnchor(),
                brand("testSequence"),
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
        it("creates a local client and inserts it into the tree on creation", async () => {
            // const provider = await TestTreeProvider.create(1);
            // const appState = new AppState(provider.trees[0], 640, 480, 1);
            // await provider.ensureSynchronized();
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
    tree: ISharedTree,
    state: JsonableTree,
    schema: SchemaData = testSchema,
): void {
    tree.storedSchema.update(schema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor(state);
        const field = editor.sequenceField(
            undefined,
            detachedFieldAsKey(forest.rootField),
        );
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}
