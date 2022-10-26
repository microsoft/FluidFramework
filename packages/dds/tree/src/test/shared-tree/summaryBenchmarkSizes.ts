/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IsoBuffer, unreachableCase } from "@fluidframework/common-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { TransactionResult } from "../../checkout";
import { FieldKinds, singleTextCursor } from "../../feature-libraries";
import { ISharedTree } from "../../shared-tree";
import { FieldKey, rootFieldKey, rootFieldKeySymbol, TreeValue } from "../../tree";
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
    it("with no nodes.", async () => {
        const provider = await TestTreeProvider.create(1);
        const tree = provider.trees[0];

        const { summary } = tree.getAttachSummary();
        const summaryString = JSON.stringify(summary);
        const summarySize = IsoBuffer.from(summaryString).byteLength;
        assert(summarySize !== 0);
        assert(summarySize < 1000);
    });
    it("with 1 inserted node.", async () => {
        const summarySize = await getInsertsSummarySize(1, TreeShape.Wide);
        assert(summarySize !== 0);
        assert(summarySize < 2000);
    });
    it("with 10 inserted nodes width-wise.", async () => {
        const summarySize = await getInsertsSummarySize(10, TreeShape.Wide);
        assert(summarySize !== 0);
        assert(summarySize < 3000);
    });
    it("with 100 inserted nodes width-wise.", async () => {
        const summarySize = await getInsertsSummarySize(100, TreeShape.Wide);
        assert(summarySize !== 0);
        assert(summarySize < 20000);
    });
    it("with 10 inserted nodes depth-wise.", async () => {
        const summarySize = await getInsertsSummarySize(10, TreeShape.Deep);
        assert(summarySize !== 0);
        assert(summarySize < 3000);
    });
    it("with 100 inserted nodes depth-wise.", async () => {
        const summarySize = await getInsertsSummarySize(100, TreeShape.Deep);
        assert(summarySize !== 0);
        assert(summarySize < 20000);
    });
    it("rejected for 1000 inserts depth wise", async () => {
        await assert.rejects(getInsertsSummarySize(1000, TreeShape.Deep), { message: "BatchTooLarge" });
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

function setTestValuesWide(tree: ISharedTree, seed: number, numNodes: number): void {
    const random = makeRandom(seed);
    for (let j = 0; j < numNodes; j++) {
        setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
    }
}

/**
 *
 * @param numberOfNodes - number of nodes you would like to insert
 * @param depth - boolean to specify inserting nodes depth wise or width wise
 * @returns the byte size of the tree's summary
 */
export async function getInsertsSummarySize(
    numberOfNodes: number,
    shape: TreeShape,
): Promise<number> {
    const seed = 0;
    const provider = await TestTreeProvider.create(1, true);
    const tree = provider.trees[0];
    initializeTestTreeWithValue(tree, 1);

    const fooKey = brand<FieldKey>("foo");
    const keySet = new Set([fooKey]);

    switch (shape) {
        case TreeShape.Deep:
            setTestValuesNarrow(keySet, seed, tree, numberOfNodes);
            break;
        case TreeShape.Wide:
            setTestValuesWide(tree, seed, numberOfNodes);
            break;
        default:
            unreachableCase(shape);
    }
    const summaryTree = await provider.summarize();
    const summaryString = JSON.stringify(summaryTree);
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
    let path: PlacePath = {
        parent: undefined,
        parentField: rootFieldKeySymbol,
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
