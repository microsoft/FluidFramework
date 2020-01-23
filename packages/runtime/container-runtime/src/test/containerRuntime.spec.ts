/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { BlobTreeEntry, TreeTreeEntry } from "@microsoft/fluid-protocol-base";
import {
    ISummaryBlob,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    SummaryObject,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import {
    UploadSummaryObject,
    IUploadSummaryTree,
    IUploadSummaryHandle,
} from "@microsoft/fluid-driver-definitions";
import {
    IConvertedSummaryResults,
    SummaryTreeConverter,
    IConvertedUploadSummaryResults,
} from "../summaryTreeConverter";

type AllSummaryObject = SummaryObject | UploadSummaryObject;

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("Utils", () => {
            function assertSummaryTree<T extends ISummaryTree | IUploadSummaryTree>(obj: AllSummaryObject): T {
                if (obj && obj.type === SummaryType.Tree) {
                    return obj as T;
                } else {
                    assert.fail("Object should be summary tree");
                }
            }
            function assertSummaryBlob(obj: AllSummaryObject): ISummaryBlob {
                if (obj && obj.type === SummaryType.Blob) {
                    return obj;
                } else {
                    assert.fail("Object should be summary blob");
                }
            }
            function assertSummaryHandle<T extends ISummaryHandle | IUploadSummaryHandle>(obj: AllSummaryObject): T {
                if (obj && obj.type === SummaryType.Handle) {
                    return obj as T;
                } else {
                    assert.fail("Object should be summary handle");
                }
            }

            describe("Convert to Summary Tree", () => {
                let summaryResults: IConvertedSummaryResults;
                let bufferLength: number;
                let converter: SummaryTreeConverter;

                before(() => {
                    converter = new SummaryTreeConverter();
                });

                beforeEach(() => {
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
                    summaryResults = converter.convertToSummaryTree(inputTree);
                });

                it("Should convert correctly", () => {
                    const summaryTree = assertSummaryTree<ISummaryTree>(summaryResults.summaryTree);

                    // blobs should parse
                    const blob = assertSummaryBlob(summaryTree.tree.b);
                    assert.strictEqual(blob.content, "test-blob");

                    // trees with ids should become handles
                    const handle = assertSummaryHandle<ISummaryHandle>(summaryTree.tree.h);
                    assert.strictEqual(handle.handleType, SummaryType.Tree);
                    assert.strictEqual(handle.handle, "test-handle");

                    // subtrees should recurse
                    const subTree = assertSummaryTree<ISummaryTree>(summaryTree.tree.t);
                    const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
                    assert.strictEqual(subBlobUtf8.content, "test-u8");
                    const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
                    assert.strictEqual(subBlobBase64.content.toString("utf-8"), "test-b64");
                });

                it("Should calculate summary data correctly", () => {
                    // nodes should count
                    assert.strictEqual(summaryResults.summaryStats.blobNodeCount, 3);
                    assert.strictEqual(summaryResults.summaryStats.handleNodeCount, 1);
                    assert.strictEqual(summaryResults.summaryStats.treeNodeCount, 2);
                    assert.strictEqual(summaryResults.summaryStats.totalBlobSize,
                        bufferLength + Buffer.byteLength("test-blob") + Buffer.byteLength("test-u8"));
                });
            });

            describe("Convert to Upload Summary Tree", () => {
                let summaryResults: IConvertedUploadSummaryResults;
                let bufferLength: number;
                let converter: SummaryTreeConverter;

                before(() => {
                    converter = new SummaryTreeConverter();
                });

                beforeEach(() => {
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
                                    new TreeTreeEntry("subtree", {
                                        id: "subtree-handle",
                                        entries: [],
                                    }),
                                ],
                            }),
                            new BlobTreeEntry("b", "test-blob"),
                            new TreeTreeEntry("h", { id: "test-handle", entries: [
                                new BlobTreeEntry("ignore", "this-should-be-ignored"),
                            ] }),
                        ],
                    };
                    summaryResults = converter.convertToUploadSummaryTree(inputTree);
                });

                it("Should convert correctly", () => {
                    const summaryTree = assertSummaryTree<IUploadSummaryTree>(summaryResults.summaryTree);

                    // blobs should parse
                    const blob = assertSummaryBlob(summaryTree.tree.b);
                    assert.strictEqual(blob.content, "test-blob");

                    // trees with ids should become handles
                    const handle = assertSummaryHandle<IUploadSummaryHandle>(summaryTree.tree.h);
                    assert.strictEqual(handle.handleType, SummaryType.Tree);
                    assert.strictEqual(handle.path, "/h");

                    // subtrees should recurse
                    const subTree = assertSummaryTree<IUploadSummaryTree>(summaryTree.tree.t);
                    const subBlobUtf8 = assertSummaryBlob(subTree.tree.bu8);
                    assert.strictEqual(subBlobUtf8.content, "test-u8");
                    const subBlobBase64 = assertSummaryBlob(subTree.tree.b64);
                    assert.strictEqual(subBlobBase64.content.toString("utf-8"), "test-b64");

                    const subTreeHandle = assertSummaryHandle<IUploadSummaryHandle>(subTree.tree.subtree);
                    assert.strictEqual(subTreeHandle.handleType, SummaryType.Tree);
                    assert.strictEqual(subTreeHandle.path, "/t/subtree");
                });

                it("Should calculate summary data correctly", () => {
                    // nodes should count
                    assert.strictEqual(summaryResults.summaryStats.blobNodeCount, 3);
                    assert.strictEqual(summaryResults.summaryStats.handleNodeCount, 2);
                    assert.strictEqual(summaryResults.summaryStats.treeNodeCount, 2);
                    assert.strictEqual(summaryResults.summaryStats.totalBlobSize,
                        bufferLength + Buffer.byteLength("test-blob") + Buffer.byteLength("test-u8"));
                });
            });
        });
    });
});
