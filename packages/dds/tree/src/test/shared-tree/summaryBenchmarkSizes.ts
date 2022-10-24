/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IsoBuffer } from "@fluidframework/common-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { TransactionResult } from "../../checkout";
import { FieldKinds, PlacePath, singleTextCursor } from "../../feature-libraries";
import { ISharedTree } from "../../shared-tree";
import { detachedFieldAsKey, FieldKey, rootFieldKey, TreeValue } from "../../tree";
import { brand } from "../../util";
import { TestTreeProvider } from "../utils";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData } from "../../schema-stored";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

describe("Summary size benchmark", () => {
    it("with no nodes.", async () => {
        const provider = await TestTreeProvider.create(1);
        const tree = provider.trees[0];

        const { summary } = tree.getAttachSummary();
        const summaryString = JSON.stringify(summary);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize < 1000);
    });
    it("with 1 inserted node.", async () => {
        const summarySize = await getInsertsSummarySize(1, 0, false);
        assert(summarySize < 1000);
    });
    it("with 10 inserted nodes width-wise.", async () => {
        const summarySize = await getInsertsSummarySize(10, 0, false);
        assert(summarySize < 3000);
    });
    it("with 100 inserted nodes width-wise.", async () => {
        const summarySize = await getInsertsSummarySize(100, 0, false);
        assert(summarySize < 20000);
    });
    it("with 10 inserted nodes depth-wise.", async () => {
        const summarySize = await getInsertsSummarySize(10, 0, true);
        assert(summarySize < 3000);
    });
    it("with 100 inserted nodes depth-wise.", async () => {
        const summarySize = await getInsertsSummarySize(100, 0, true);
        assert(summarySize < 20000);
    });
    it("rejected for 1000 inserts depth wise", async () => {
        await assert.rejects(getInsertsSummarySize(1000, 0, true), { message: "BatchTooLarge" });
    });
});

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue, index: number): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
        field.insert(index, writeCursor);

        return TransactionResult.Apply;
    });
}

function setTestValueOnPath(tree: ISharedTree, value: TreeValue, path: PlacePath): void {
    // Apply an edit to the tree which inserts a node with a value.
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(path, detachedFieldAsKey(forest.rootField));
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}

function setTestValuesWide(tree: ISharedTree, seed: number, numNodes: number): void {
    const random = makeRandom(seed);
    for (let j = 0; j < numNodes; j++) {
        setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
    }
}

/**
 *
 * @param numNodes - number of nodes you would like to insert
 * @param seed - seed to randomly generate values for the inserts
 * @param depth - boolean to specify inserting nodes depth wise or width wise
 * @returns the byte size of the tree's summary
 */
export async function getInsertsSummarySize(
    numNodes: number,
    seed: number,
    depth?: boolean,
): Promise<number> {
    const provider = await TestTreeProvider.create(1);
    const tree = provider.trees[0];
    initializeTestTreeWithValue(tree, 1);

    if (depth) {
        const fooKey = brand<FieldKey>("foo");
        const keySet = new Set([fooKey]);
        setTestValuesNarrow(keySet, seed, tree, numNodes);
    } else {
        setTestValuesWide(tree, seed, numNodes);
    }
    const { summary } = tree.getAttachSummary();
    const summaryString = JSON.stringify(summary);
    const summarySize = IsoBuffer.from(summaryString).byteLength;
    return summarySize;
}

function setTestValuesNarrow(
    parentKeys: Set<FieldKey>,
    seed: number,
    tree: ISharedTree,
    maxDepth: number,
): void {
    const random = makeRandom(seed);
    const rootKey = detachedFieldAsKey(tree.forest.rootField);
    let path: PlacePath = {
        parent: undefined,
        parentField: rootKey,
        parentIndex: 0,
    };
    // loop through and update path for the next insert.
    for (let i = 0; i <= maxDepth; i++) {
        setTestValueOnPath(
            tree,
            random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            path,
        );
        path = {
            parent: path,
            parentField: rootKey,
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
        const field = editor.sequenceField(undefined, detachedFieldAsKey(forest.rootField));
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}
