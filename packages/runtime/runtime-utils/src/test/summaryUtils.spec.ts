/* eslint-disable no-null/no-null */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import {
    SummaryObject,
    ISummaryTree,
    ISummaryBlob,
    ISummaryHandle,
    SummaryType,
    ITree,
} from "@fluidframework/protocol-definitions";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import { convertToSummaryTree } from "../summaryUtils";

describe("Summary Utils", () => {
    describe("Convert to Summary Tree", () => {
        function assertSummaryTree(obj: SummaryObject): ISummaryTree {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (obj && obj.type === SummaryType.Tree) {
                return obj;
            } else {
                assert.fail("Object should be summary tree");
            }
        }
        function assertSummaryBlob(obj: SummaryObject): ISummaryBlob {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (obj && obj.type === SummaryType.Blob) {
                return obj;
            } else {
                assert.fail("Object should be summary blob");
            }
        }
        function assertSummaryHandle(obj: SummaryObject): ISummaryHandle {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (obj && obj.type === SummaryType.Handle) {
                return obj;
            } else {
                assert.fail("Object should be summary handle");
            }
        }

        let bufferLength: number;
        let inputTree: ITree;

        beforeEach(() => {
            const base64Content = IsoBuffer.from("test-b64").toString("base64");
            bufferLength = IsoBuffer.from(base64Content, "base64").byteLength;
            inputTree = {
                id: null,
                entries: [
                    new TreeTreeEntry("t", {
                        id: null,
                        entries: [
                            new BlobTreeEntry("bu8", "test-u8"),
                            new BlobTreeEntry("b64", base64Content, "base64"),
                        ],
                    }),
                    new BlobTreeEntry("b", "test-blob"),
                    new TreeTreeEntry("h", {
                        id: "test-handle", entries: [
                            new BlobTreeEntry("ignore", "this-should-be-ignored"),
                        ],
                    }),
                ],
            };
        });

        it("Should convert correctly", () => {
            const summaryResults = convertToSummaryTree(inputTree);
            const summaryTree = assertSummaryTree(summaryResults.summary);

            // blobs should parse
            const blob = assertSummaryBlob(summaryTree.tree.b);
            assert.strictEqual(blob.content, "test-blob");

            // trees with ids should become handles
            const handle = assertSummaryHandle(summaryTree.tree.h);
            assert.strictEqual(handle.handleType, SummaryType.Tree);
            assert.strictEqual(handle.handle, "test-handle");

            // subtrees should recurse
            const subTree = assertSummaryTree(summaryTree.tree.t);
            const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
            assert.strictEqual(subBlobUtf8.content, "test-u8");
            const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
            assert.strictEqual(Uint8ArrayToString(subBlobBase64.content as Uint8Array), "test-b64");
        });

        it("Should convert correctly with fullTree enabled", () => {
            const summaryResults = convertToSummaryTree(inputTree, true);
            const summaryTree = assertSummaryTree(summaryResults.summary);

            // blobs should parse
            const blob = assertSummaryBlob(summaryTree.tree.b);
            assert.strictEqual(blob.content, "test-blob");

            // trees with ids should not become handles
            const usuallyIgnoredSubtree = assertSummaryTree(summaryTree.tree.h);
            const usuallyIgnoredBlob = assertSummaryBlob(usuallyIgnoredSubtree.tree.ignore);
            assert.strictEqual(usuallyIgnoredBlob.content, "this-should-be-ignored");

            // subtrees should recurse
            const subTree = assertSummaryTree(summaryTree.tree.t);
            const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
            assert.strictEqual(subBlobUtf8.content, "test-u8");
            const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
            assert.strictEqual(Uint8ArrayToString(subBlobBase64.content as Uint8Array), "test-b64");
        });

        it("Should calculate summary data correctly", () => {
            const summaryResults = convertToSummaryTree(inputTree);
            // nodes should count
            assert.strictEqual(summaryResults.stats.blobNodeCount, 3);
            assert.strictEqual(summaryResults.stats.handleNodeCount, 1);
            assert.strictEqual(summaryResults.stats.treeNodeCount, 2);
            assert.strictEqual(summaryResults.stats.totalBlobSize,
                bufferLength + IsoBuffer.from("test-blob").byteLength + IsoBuffer.from("test-u8").byteLength);
        });
    });
});
