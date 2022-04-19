/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import {
    IMergeBlock,
    MaxNodesInBlock,
    MergeTree,
} from "../mergeTree";
import {
    MergeTreeTextHelper,
    TextSegment,
} from "../textSegment";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { insertText, nodeOrdinalsHaveIntegrity } from "./testUtils";

interface ITestTreeFactory {
    readonly create: () => ITestData;
    readonly name: string;
}

interface ITestData {
    readonly mergeTree: MergeTree;
    readonly textHelper: MergeTreeTextHelper;
    readonly initialText: string;
    readonly middle: number;
    readonly refSeq: number;
}

const localClientId = 17;
const treeFactories: ITestTreeFactory[] = [
    {
        create: () => {
            const initialText = "hello world";
            const mergeTree = new MergeTree();
            mergeTree.insertSegments(
                0,
                [TextSegment.make(initialText)],
                UniversalSequenceNumber,
                LocalClientId,
                UniversalSequenceNumber,
                undefined);
            mergeTree.startCollaboration(
                localClientId,
                /* minSeq: */ UniversalSequenceNumber,
                /* currentSeq: */ UniversalSequenceNumber);
            return {
                initialText,
                mergeTree,
                middle: Math.round(initialText.length / 2),
                refSeq: UniversalSequenceNumber,
                textHelper: new MergeTreeTextHelper(mergeTree),
            };
        },
        name: "single segment tree",
    },
    {
        create: () => {
            let initialText = "0";
            const mergeTree = new MergeTree();
            mergeTree.insertSegments(
                0,
                [TextSegment.make(initialText)],
                UniversalSequenceNumber,
                LocalClientId,
                UniversalSequenceNumber,
                undefined);
            for (let i = 1; i < MaxNodesInBlock - 1; i++) {
                const text = i.toString();
                insertText(
                    mergeTree,
                    mergeTree.getLength(UniversalSequenceNumber, localClientId),
                    UniversalSequenceNumber,
                    localClientId,
                    UniversalSequenceNumber,
                    text,
                    undefined,
                    undefined);
                initialText += text;
            }

            const textHelper = new MergeTreeTextHelper(mergeTree);
            assert.equal(
                textHelper.getText(UniversalSequenceNumber, localClientId),
                initialText);

            const nodes: IMergeBlock[] = [mergeTree.root];
            while (nodes.length > 0) {
                const node = nodes.pop()!;
                assert.equal(node.childCount, MaxNodesInBlock - 1);
                const childrenBlocks =
                    node.children
                        .map((v) => v as IMergeBlock)
                        .filter((v) => v === undefined);
                nodes.push(...childrenBlocks);
            }

            mergeTree.startCollaboration(
                localClientId,
                /* minSeq: */ UniversalSequenceNumber,
                /* currentSeq: */ UniversalSequenceNumber);
            return {
                initialText,
                mergeTree,
                middle: Math.round(MaxNodesInBlock / 2),
                refSeq: UniversalSequenceNumber,
                textHelper,
            };
        },
        name: "Full single layer tree",
    },
    {
        create: () => {
            let initialText = "0";
            const mergeTree = new MergeTree();
            mergeTree.insertSegments(
                0,
                [TextSegment.make(initialText)],
                UniversalSequenceNumber,
                LocalClientId,
                UniversalSequenceNumber,
                undefined);
            for (let i = 1; i < MaxNodesInBlock * 4; i++) {
                const text = i.toString();
                insertText(
                    mergeTree,
                    mergeTree.getLength(UniversalSequenceNumber, localClientId),
                    UniversalSequenceNumber,
                    localClientId,
                    UniversalSequenceNumber,
                    text,
                    undefined,
                    undefined);
                initialText += text;
            }

            const remove = Math.round(initialText.length / 4);
            // remove from start
            mergeTree.markRangeRemoved(
                0,
                remove,
                UniversalSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any);
            initialText = initialText.substring(remove);

            // remove from end
            mergeTree.markRangeRemoved(
                initialText.length - remove,
                initialText.length,
                UniversalSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any);
            initialText = initialText.substring(0, initialText.length - remove);

            mergeTree.startCollaboration(
                localClientId,
                /* minSeq: */ UniversalSequenceNumber,
                /* currentSeq: */ UniversalSequenceNumber);

            return {
                initialText,
                mergeTree,
                middle: Math.round(initialText.length / 2),
                refSeq: UniversalSequenceNumber,
                textHelper: new MergeTreeTextHelper(mergeTree),
            };
        },
        name: "Tree with remove segments",
    },
];

describe("MergeTree.insertingWalk", () => {
    treeFactories.forEach((tf) => {
        describe(tf.name, () => {
            const treeFactory = tf;
            let testData: ITestData;
            beforeEach(() => {
                testData = treeFactory.create();
                assert(nodeOrdinalsHaveIntegrity(testData.mergeTree.root));
            });
            afterEach(() => {
                assert(nodeOrdinalsHaveIntegrity(testData.mergeTree.root));
            });
            describe("insertText", () => {
                it("at beginning", () => {
                    insertText(
                        testData.mergeTree,
                        0,
                        testData.refSeq,
                        localClientId,
                        UnassignedSequenceNumber,
                        "a",
                        undefined,
                        undefined);

                    assert.equal(
                        testData.mergeTree.getLength(testData.refSeq, localClientId),
                        testData.initialText.length + 1);
                    const currentValue = testData.textHelper.getText(
                        testData.refSeq,
                        localClientId);
                    assert.equal(currentValue.length, testData.initialText.length + 1);
                    assert.equal(currentValue, `a${testData.initialText}`);
                });

                it("at end", () => {
                    insertText(
                        testData.mergeTree,
                        testData.initialText.length,
                        testData.refSeq,
                        localClientId,
                        UnassignedSequenceNumber,
                        "a",
                        undefined,
                        undefined);

                    assert.equal(
                        testData.mergeTree.getLength(testData.refSeq, localClientId),
                        testData.initialText.length + 1);
                    const currentValue = testData.textHelper.getText(
                        testData.refSeq,
                        localClientId);
                    assert.equal(currentValue.length, testData.initialText.length + 1);
                    assert.equal(currentValue, `${testData.initialText}a`);
                });

                it("in middle", () => {
                    insertText(
                        testData.mergeTree,
                        testData.middle,
                        testData.refSeq,
                        localClientId,
                        UnassignedSequenceNumber,
                        "a",
                        undefined,
                        undefined);

                    assert.equal(
                        testData.mergeTree.getLength(testData.refSeq, localClientId),
                        testData.initialText.length + 1);
                    const currentValue = testData.textHelper.getText(
                        testData.refSeq,
                        localClientId);
                    assert.equal(currentValue.length, testData.initialText.length + 1);
                    assert.equal(
                        currentValue,
                        `${testData.initialText.substring(0, testData.middle)}` +
                        "a" +
                        `${testData.initialText.substring(testData.middle)}`);
                });
            });
        });
    });
});
