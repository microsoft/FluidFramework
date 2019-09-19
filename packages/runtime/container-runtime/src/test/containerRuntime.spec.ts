/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISummaryBlob,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    SummaryObject,
    SummaryTree,
    SummaryType,
} from "@prague/protocol-definitions";
import * as assert from "assert";
import { IGeneratedSummaryData } from "../summarizer";
import { BlobTreeEntry, convertToSummaryTree, TreeTreeEntry } from "../utils";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("Utils", () => {
            function assertSummaryTree(obj: SummaryObject): ISummaryTree {
                if (obj && obj.type === SummaryType.Tree) {
                    return obj;
                } else {
                    assert.fail("Object should be summary tree");
                }
            }
            function assertSummaryBlob(obj: SummaryObject): ISummaryBlob {
                if (obj && obj.type === SummaryType.Blob) {
                    return obj;
                } else {
                    assert.fail("Object should be summary blob");
                }
            }
            function assertSummaryHandle(obj: SummaryObject): ISummaryHandle {
                if (obj && obj.type === SummaryType.Handle) {
                    return obj;
                } else {
                    assert.fail("Object should be summary handle");
                }
            }

            describe("Convert to Summary Tree", () => {
                let summaryData: IGeneratedSummaryData;
                let rawTree: SummaryTree;
                let bufferLength: number;

                beforeEach(() => {
                    summaryData = {
                        sequenceNumber: 0,
                        treeNodeCount: 0,
                        blobNodeCount: 0,
                        handleNodeCount: 0,
                        totalBlobSize: 0,
                    };

                    const base64Content = Buffer.from("test-b64").toString("base64");
                    bufferLength = Buffer.from(base64Content, "base64").byteLength;
                    const inputTree: ITree = {
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
                            new TreeTreeEntry("h", { id: "test-handle", entries: [
                                new BlobTreeEntry("ignore", "this-should-be-ignored"),
                            ] }),
                        ],
                    };
                    rawTree = convertToSummaryTree(inputTree, summaryData);
                });

                it("Should convert correctly", () => {
                    const summaryTree = assertSummaryTree(rawTree);

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
                    assert.strictEqual(subBlobBase64.content.toString("utf-8"), "test-b64");
                });

                it("Should calculate summary data correctly", () => {
                    // nodes should count
                    assert.strictEqual(summaryData.blobNodeCount, 3);
                    assert.strictEqual(summaryData.handleNodeCount, 1);
                    assert.strictEqual(summaryData.treeNodeCount, 2);
                    assert.strictEqual(summaryData.totalBlobSize,
                        bufferLength + Buffer.byteLength("test-blob") + Buffer.byteLength("test-u8"));
                });
            });
        });
    });
});
