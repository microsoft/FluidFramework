/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "assert";
import {
    IMergeBlock,
    MaxNodesInBlock,
} from "../mergeTreeNodes";
import {
    TextSegment,
} from "../textSegment";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { MergeTree } from "../mergeTree";
import { MergeTreeTextHelper } from "../MergeTreeTextHelper";
import { insertSegments, insertText, markRangeRemoved, nodeOrdinalsHaveIntegrity } from "./testUtils";

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
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make(initialText)],
                refSeq: UniversalSequenceNumber,
                clientId: LocalClientId,
                seq: UniversalSequenceNumber,
                opArgs: undefined,
            });
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
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make(initialText)],
                refSeq: UniversalSequenceNumber,
                clientId: LocalClientId,
                seq: UniversalSequenceNumber,
                opArgs: undefined,
            });
            for (let i = 1; i < MaxNodesInBlock - 1; i++) {
                const text = i.toString();
                insertText({
                    mergeTree,
                    pos: mergeTree.getLength(UniversalSequenceNumber, localClientId),
                    refSeq: UniversalSequenceNumber,
                    clientId: localClientId,
                    seq: UniversalSequenceNumber,
                    text,
                    props: undefined,
                    opArgs: undefined,
                });
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
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make(initialText)],
                refSeq: UniversalSequenceNumber,
                clientId: LocalClientId,
                seq: UniversalSequenceNumber,
                opArgs: undefined,
            });
            for (let i = 1; i < MaxNodesInBlock * 4; i++) {
                const text = i.toString();
                insertText({
                    mergeTree,
                    pos: mergeTree.getLength(UniversalSequenceNumber, localClientId),
                    refSeq: UniversalSequenceNumber,
                    clientId: localClientId,
                    seq: UniversalSequenceNumber,
                    text,
                    props: undefined,
                    opArgs: undefined,
                });
                initialText += text;
            }

            const remove = Math.round(initialText.length / 4);
            // remove from start
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: remove,
                refSeq: UniversalSequenceNumber,
                clientId: localClientId,
                seq: UnassignedSequenceNumber,
                overwrite: false,
                opArgs: undefined as any,
            });
            initialText = initialText.substring(remove);

            // remove from end
            markRangeRemoved({
                mergeTree,
                start: initialText.length - remove,
                end: initialText.length,
                refSeq: UniversalSequenceNumber,
                clientId: localClientId,
                seq: UnassignedSequenceNumber,
                overwrite: false,
                opArgs: undefined as any,
            });
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
                    insertText({
                        mergeTree: testData.mergeTree,
                        pos: 0,
                        refSeq: testData.refSeq,
                        clientId: localClientId,
                        seq: UnassignedSequenceNumber,
                        text: "a",
                        props: undefined,
                        opArgs: undefined,
                    });

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
                    insertText({
                        mergeTree: testData.mergeTree,
                        pos: testData.initialText.length,
                        refSeq: testData.refSeq,
                        clientId: localClientId,
                        seq: UnassignedSequenceNumber,
                        text: "a",
                        props: undefined,
                        opArgs: undefined,
                    });

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
                    insertText({
                        mergeTree: testData.mergeTree,
                        pos: testData.middle,
                        refSeq: testData.refSeq,
                        clientId: localClientId,
                        seq: UnassignedSequenceNumber,
                        text: "a",
                        props: undefined,
                        opArgs: undefined,
                    });

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

    it("handles conflicts involving removed segments across block boundaries", () => {
        let initialText = "0";
        let seq = 0;
        const mergeTree = new MergeTree();
        mergeTree.startCollaboration(localClientId, 0, seq);
        insertSegments({
            mergeTree,
            pos: 0,
            segments: [TextSegment.make(initialText)],
            refSeq: UniversalSequenceNumber,
            clientId: localClientId,
            seq: UniversalSequenceNumber,
            opArgs: undefined,
        });
        for (let i = 1; i < MaxNodesInBlock; i++) {
            const text = String.fromCharCode(i + 64);
            insertText({
                mergeTree,
                pos: 0,
                refSeq: UniversalSequenceNumber,
                clientId: localClientId,
                seq: UnassignedSequenceNumber,
                text,
                props: undefined,
                opArgs: undefined,
            });
            initialText += text;
        }

        const textHelper = new MergeTreeTextHelper(mergeTree);

        assert.equal(mergeTree.root.childCount, 2);
        assert.equal(textHelper.getText(0, localClientId), "GFEDCBA0");
        // Remove "DCBA"
        markRangeRemoved({
            mergeTree,
            start: 3,
            end: 7,
            refSeq: UniversalSequenceNumber,
            clientId: localClientId,
            seq: UnassignedSequenceNumber,
            overwrite: false,
            opArgs: undefined as any,
        });
        assert.equal(textHelper.getText(0, localClientId), "GFE0");
        // Simulate another client inserting concurrently with the above operations. Because
        // all segments but the 0 are unacked, this insert should place the segment directly
        // before the 0. Prior to this regression test, an issue with `rightExcursion` in the
        // merge conflict logic instead caused the segment to be placed before the removed segments.
        insertText({
            mergeTree,
            pos: 0,
            refSeq: UniversalSequenceNumber,
            clientId: localClientId + 1,
            seq: ++seq,
            text: "x",
        });

        const segments: string[] = [];
        mergeTree.walkAllSegments(mergeTree.root, (seg) => {
            if (TextSegment.is(seg)) {
                if (seg.localRemovedSeq !== undefined || seg.removedSeq !== undefined) {
                    segments.push(`(${seg.text})`);
                } else {
                    segments.push(seg.text);
                }
            }
            return true;
        });

        assert.deepStrictEqual(segments, ["G", "F", "E", "(D)", "(C)", "(B)", "(A)", "x", "0"]);
    });
});
