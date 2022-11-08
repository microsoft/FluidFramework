/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IsoBuffer, unreachableCase } from "@fluidframework/common-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { TransactionResult } from "../../checkout";
import { FieldKinds, singleTextCursor } from "../../feature-libraries";
import { ISharedTree } from "../../shared-tree";
import { rootFieldKey, rootFieldKeySymbol, TreeValue } from "../../tree";
import { brand } from "../../util";
import { TestTreeProvider } from "../utils";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData } from "../../schema-stored";
// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

enum TreeShape {
    Wide = 0,
    Deep = 1,
}

// TODO: report these sizes as benchmark output which can be tracked over time.
describe("Summary size benchmark", () => {
    it("for an empty tree.", async () => {
        const provider = await TestTreeProvider.create(1, true);
        const tree = provider.trees[0];
        const { summary } = tree.getAttachSummary();
        const summaryString = JSON.stringify(summary);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize < 1000);
    });
    it("for a tree with 1 node.", async () => {
        const summaryTree = await getInsertsSummaryTree(1, TreeShape.Wide);
        const summaryString = JSON.stringify(summaryTree);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize > 1000);
        assert(summarySize < 2000);
    });
    it("for a wide tree with 10 nodes", async () => {
        const summaryTree = await getInsertsSummaryTree(10, TreeShape.Wide);
        const summaryString = JSON.stringify(summaryTree);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize > 1000);
        assert(summarySize < 10000);
    });
    it("for a wide tree with 100 nodes", async () => {
        const summaryTree = await getInsertsSummaryTree(100, TreeShape.Wide);
        const summaryString = JSON.stringify(summaryTree);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize > 1000);
        assert(summarySize < 50000);
    });
    it("for a deep tree with 10 nodes", async () => {
        const summaryTree = await getInsertsSummaryTree(10, TreeShape.Deep);
        const summaryString = JSON.stringify(summaryTree);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize > 1000);
        assert(summarySize < 20000);
    });
    it("for a deep tree with 100 nodes.", async () => {
        const summaryTree = await getInsertsSummaryTree(100, TreeShape.Deep);
        const summaryString = JSON.stringify(summaryTree);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize > 1000);
        assert(summarySize < 1000000);
    });
    // TODO: this should work, but currently hits batch size limits. Convert this into benchmark when fixed.
    it("rejected for deep tree with 1000 nodes", async () => {
        await assert.rejects(getInsertsSummaryTree(1000, TreeShape.Deep), {
            message: "BatchTooLarge",
        });
    });
});

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue, index: number): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(index, writeCursor);

        return TransactionResult.Apply;
    });
}

function setTestValueOnPath(tree: ISharedTree, value: TreeValue, path: PlacePath): void {
    // Apply an edit to the tree which inserts a node with a value.
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(path, rootFieldKeySymbol);
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}

function setTestValuesWide(tree: ISharedTree, numberOfNodes: number): void {
    const seed = 0;
    const random = makeRandom(seed);
    for (let j = 0; j < numberOfNodes; j++) {
        setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
    }
}

/**
 *
 * @param numberOfNodes - number of nodes you would like to insert
 * @param shape - TreeShape enum to specify the shape of the tree
 * @returns the byte size of the tree's summary
 */
export async function getInsertsSummaryTree(
    numberOfNodes: number,
    shape: TreeShape,
): Promise<ISummaryTree> {
    const provider = await TestTreeProvider.create(1, true);
    const tree = provider.trees[0];
    initializeTestTreeWithValue(tree, 1);

    switch (shape) {
        case TreeShape.Deep:
            setTestValuesNarrow(tree, numberOfNodes);
            break;
        case TreeShape.Wide:
            setTestValuesWide(tree, numberOfNodes);
            break;
        default:
            unreachableCase(shape);
    }
    await provider.ensureSynchronized();
    const { summary } = tree.getAttachSummary(true);
    return summary;
}

function setTestValuesNarrow(tree: ISharedTree, numberOfNodes: number): void {
    const seed = 0;
    const random = makeRandom(seed);
    let path: PlacePath = {
        parent: undefined,
        parentField: rootFieldKeySymbol,
        parentIndex: 0,
    };
    // loop through and update path for the next insert.
    for (let i = 0; i <= numberOfNodes; i++) {
        setTestValueOnPath(
            tree,
            random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            path,
        );
        path = {
            parent: path,
            parentField: rootFieldKeySymbol,
            parentIndex: 0,
        };
    }
}

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
    name: brand("TestValue"),
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
 * Inserts a single node under the root of the tree with the given value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    tree.storedSchema.update(testSchema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}
