/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { TransactionResult } from "../../checkout";
import { PlacePath, singleTextCursor } from "../../feature-libraries";
import { ISharedTree } from "../../shared-tree";
import { detachedFieldAsKey, FieldKey, TreeValue } from "../../tree";
import { brand } from "../../util";
import { TestTreeProvider } from "../utils";

describe("Summary size benchmark", () => {
    it("for different sized trees", async () => {
        const output = await getSummaryBenchmarkSizes();
        assert(output.summarySizeWideInsert1 < 1000);
        assert(output.summarySizeWideInsert10 < 3000);
        assert(output.summarySizeWideInsert100 < 20000);
        assert(output.summarySizeNarrowInsert10 < 3000);
        assert(output.summarySizeNarrowInsert100 < 20000);
        assert(output.summarySizeNoEdits < 1000);
    });
});

export interface summarySizeBenchmarks {
    /**
     * byte size of the resulting summary of a testTree with no edits.
     */
    summarySizeNoEdits: number;
    /**
     * byte size of the resulting summary of a testTree with 1 inserted node.
     * node is inserted width wise (resulting in a wide tree)
     */
    summarySizeWideInsert1: number;
    /**
     * byte size of the resulting summary of a testTree with 10 inserted nodes.
     * nodes are inserted width wise (resulting in a wide tree)
     */
    summarySizeWideInsert10: number;
    /**
     * byte size of the resulting summary of a testTree with 100 inserted nodes.
     * nodes are inserted width wise (resulting in a wide tree)
     */
    summarySizeWideInsert100: number;
    /**
     * byte size of the resulting summary of a testTree with 10 inserted nodes.
     * nodes are inserted depth wise (resulting in a narrow/deep tree)
     */
    summarySizeNarrowInsert10: number;
    /**
     * byte size of the resulting summary of a testTree with 100 inserted nodes.
     * nodes are inserted depth wise (resulting in a narrow/deep tree)
     */
    summarySizeNarrowInsert100: number;
}

/**
 *
 * @returns an object with the summary sized of trees with various edits
 */
export async function getSummaryBenchmarkSizes(): Promise<summarySizeBenchmarks> {
    const summarySizes: summarySizeBenchmarks = {
        summarySizeNoEdits: 0,
        summarySizeWideInsert1: 0,
        summarySizeWideInsert10: 0,
        summarySizeWideInsert100: 0,
        summarySizeNarrowInsert10: 0,
        summarySizeNarrowInsert100: 0,
    };

    // summary size for tree with no edit.
    const provider = await TestTreeProvider.create(1);
    const tree = provider.trees[0];

    const { summary } = tree.getAttachSummary();
    const summaryString = JSON.stringify(summary);
    summarySizes.summarySizeNoEdits = IsoBuffer.from(summaryString).byteLength;

    const seed = 0;

    // summary sizes for inserting nodes resulting in wide trees.
    summarySizes.summarySizeWideInsert1 = await getInsertsSummarySize(1, seed);
    summarySizes.summarySizeWideInsert10 = await getInsertsSummarySize(10, seed);
    summarySizes.summarySizeWideInsert100 = await getInsertsSummarySize(100, seed);

    // summary sizes for inserting nodes resulting narrow/deep trees.
    summarySizes.summarySizeNarrowInsert10 = await getInsertsSummarySize(10, seed, true);
    summarySizes.summarySizeNarrowInsert100 = await getInsertsSummarySize(100, seed, true);

    return summarySizes;
}

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue, index: number): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        editor.insert(
            {
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: index,
            },
            writeCursor,
        );

        return TransactionResult.Apply;
    });
}

function setTestValueOnPath(tree: ISharedTree, value: TreeValue, path: PlacePath): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((_forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        editor.insert(path, writeCursor);
        return TransactionResult.Apply;
    });
}

function setTestValuesWide(tree: ISharedTree, seed: number, numNodes: number): void {
    const random = makeRandom(seed);
    for (let j = 0; j < numNodes; j++) {
        setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
    }
}

async function getInsertsSummarySize(
    numNodes: number,
    seed: number,
    depth?: boolean,
): Promise<number> {
    const provider = await TestTreeProvider.create(1);
    const tree = provider.trees[0];

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
    const fieldKeys = Array.from(parentKeys);
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
            parentField: random.pick(fieldKeys),
            parentIndex: 0,
        };
    }
}
