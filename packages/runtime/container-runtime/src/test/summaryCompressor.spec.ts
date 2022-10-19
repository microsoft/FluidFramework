/* eslint-disable @typescript-eslint/comma-dangle */
/* eslint-disable max-len */
/* eslint-disable quote-props */
/* eslint-disable @typescript-eslint/dot-notation */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import {
    ISummaryStats,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";

import {
    ISnapshotTree,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";

import { IsoBuffer } from "@fluidframework/common-utils";

import {
    compressSummaryTree,
    fastCloneStats,
    fastCloneTree,
} from "../summaryCompressor";

describe("Runtime", () => {
    describe("Summarization", () => {
        describe("Summary Logical Compressor", () => {
            describe("Fast cloning", () => {
                it("should accurately clone stats", () => {
                    const orig: ISummaryStats = {
                        treeNodeCount: 1,
                        blobNodeCount: 2,
                        handleNodeCount: 3,
                        totalBlobSize: 12345,
                        unreferencedBlobSize: 5,
                    };
                    const copy: ISummaryStats = fastCloneStats(orig);
                    assert.strictEqual(copy.treeNodeCount, orig.treeNodeCount);
                    assert.strictEqual(copy.blobNodeCount, orig.blobNodeCount);
                    assert.strictEqual(
                        copy.handleNodeCount,
                        orig.handleNodeCount
                    );
                    assert.strictEqual(copy.totalBlobSize, orig.totalBlobSize);
                    assert.strictEqual(
                        copy.unreferencedBlobSize,
                        orig.unreferencedBlobSize
                    );
                });
                it("should accurately clone handles from the summary tree", () => {
                    const orig: ISummaryTree = testDataSummaryTree();
                    const copy: ISummaryTree = fastCloneTree(orig);
                    const origHandlePath =
                        orig.tree[".channels"]["tree"]["rootDOId"]["tree"][
                            ".channels"
                        ]["tree"]["root"];
                    const copyHandlePath =
                        copy.tree[".channels"]["tree"]["rootDOId"]["tree"][
                            ".channels"
                        ]["tree"]["root"];
                    assert.strictEqual(origHandlePath.type, SummaryType.Handle);
                    assert.strictEqual(
                        origHandlePath.handle,
                        "/.channels/rootDOId/.channels/root"
                    );
                    assert.strictEqual(
                        origHandlePath.handleType,
                        SummaryType.Tree
                    );
                    assert.deepStrictEqual(origHandlePath, copyHandlePath);
                });
                it("should accurately reference blobs from the summary tree", () => {
                    const orig: ISummaryTree = testDataSummaryTree();
                    const copy: ISummaryTree = fastCloneTree(orig);
                    const origBlob =
                        orig.tree[".channels"]["tree"]["rootDOId"]["tree"][
                            ".channels"
                        ]["tree"]["2577dc32-1c82-4dd2-a3ce-f62433e74ae2"][
                            "tree"
                        ]["summaryChunk_0"];
                    const copyBlob =
                        copy.tree[".channels"]["tree"]["rootDOId"]["tree"][
                            ".channels"
                        ]["tree"]["2577dc32-1c82-4dd2-a3ce-f62433e74ae2"][
                            "tree"
                        ]["summaryChunk_0"];
                    assert.deepStrictEqual(origBlob.type, SummaryType.Blob);
                    assert.deepStrictEqual(
                        origBlob.content,
                        IsoBuffer.from("This is the first chunk")
                    );
                    assert.deepStrictEqual(origBlob, copyBlob);
                });
                it("should accurately clone full summary trees", () => {
                    const orig: ISummaryTree = testDataSummaryTree();
                    const copy: ISummaryTree = fastCloneTree(orig);
                    assert.deepStrictEqual(copy, orig);
                });
            });
            describe("Logical compression", () => {
                it("should reduce summary size", async () => {
                    const previousSnapshot: ISnapshotTree =
                        testDataSnapshotTree();
                    const originalStats: ISummaryStats = {
                        treeNodeCount: 5,
                        blobNodeCount: 13,
                        handleNodeCount: 1,
                        totalBlobSize: 12345,
                        unreferencedBlobSize: 0,
                    };
                    const originalSummary: ISummaryTree = testDataSummaryTree();
                    const originalSummaryWithStats: ISummaryTreeWithStats = {
                        stats: originalStats,
                        summary: originalSummary,
                    };
                    const compressedSummary = await compressSummaryTree(
                        originalSummaryWithStats,
                        previousSnapshot,
                        readBlob
                    );
                    assert.strictEqual(
                        compressedSummary.stats.blobNodeCount,
                        originalStats.blobNodeCount - 6
                    );
                    assert.strictEqual(
                        compressedSummary.stats.handleNodeCount,
                        originalStats.handleNodeCount + 6
                    );

                    const expectedSizeReduction =
                        IsoBuffer.from("This is the first chunk").byteLength +
                        IsoBuffer.from("This is the second chunk").byteLength +
                        IsoBuffer.from("This is the third chunk").byteLength +
                        IsoBuffer.from("This is the fourth chunk").byteLength +
                        IsoBuffer.from("This is the fifth chunk").byteLength +
                        IsoBuffer.from("This is the sixth chunk").byteLength;

                    assert.strictEqual(
                        compressedSummary.stats.totalBlobSize,
                        originalStats.totalBlobSize - expectedSizeReduction
                    );
                });
                it("should create handles to blobs from the previous snapshot", async () => {
                    const previousSnapshot: ISnapshotTree =
                        testDataSnapshotTree();
                    const originalStats: ISummaryStats = {
                        treeNodeCount: 5,
                        blobNodeCount: 13,
                        handleNodeCount: 1,
                        totalBlobSize: 12345,
                        unreferencedBlobSize: 0,
                    };
                    const originalSummary: ISummaryTree = testDataSummaryTree();
                    const originalSummaryWithStats: ISummaryTreeWithStats = {
                        stats: originalStats,
                        summary: originalSummary,
                    };

                    const originalChunks =
                        originalSummary.tree[".channels"]["tree"]["rootDOId"][
                            "tree"
                        ][".channels"]["tree"][
                            "2577dc32-1c82-4dd2-a3ce-f62433e74ae2"
                        ]["tree"];
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_0.type,
                        SummaryType.Blob
                    );
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_1.type,
                        SummaryType.Blob
                    );
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_2.type,
                        SummaryType.Blob
                    );
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_3.type,
                        SummaryType.Blob
                    );
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_4.type,
                        SummaryType.Blob
                    );
                    assert.deepStrictEqual(
                        originalChunks.summaryChunk_5.type,
                        SummaryType.Blob
                    );

                    const compressedSummary = await compressSummaryTree(
                        originalSummaryWithStats,
                        previousSnapshot,
                        readBlob
                    );
                    const summaryChunks =
                        compressedSummary.summary.tree[".channels"]["tree"][
                            "rootDOId"
                        ]["tree"][".channels"]["tree"][
                            "2577dc32-1c82-4dd2-a3ce-f62433e74ae2"
                        ]["tree"];

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_0.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_0.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_0"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_0.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_1.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_1.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_1"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_1.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_2.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_2.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_2"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_2.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_3.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_3.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_3"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_3.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_4.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_4.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_4"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_4.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_5.type,
                        SummaryType.Handle
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_5.handle,
                        ".channels/rootDOId/.channels/f4cf9f85-0d22-43dd-b91b-52ee003d9d2c/summaryChunk_5"
                    );
                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_5.handleType,
                        SummaryType.Blob
                    );

                    assert.deepStrictEqual(
                        summaryChunks.summaryChunk_6.type,
                        SummaryType.Blob
                    );
                });
            });
        });
    });
});

const readBlob = async (id: string): Promise<ArrayBufferLike> => {
    let buffer: IsoBuffer;
    switch (id) {
        case "bARDQwhaqJvqIS38b2zzuPGrL":
            buffer = IsoBuffer.from("This is the first chunk");
            break;
        case "bARArVXzvWHYQ6Pfvew4D73dG":
            buffer = IsoBuffer.from("This is the second chunk");
            break;
        case "bARCfsqYRo7Tcc4At3GrReF+8":
            buffer = IsoBuffer.from("This is the third chunk");
            break;
        case "bARBsGcltNqNYHWTuYNKrsmar":
            buffer = IsoBuffer.from("This is the fourth chunk");
            break;
        case "bARCfsqYRo7Tcc4At3GrReF98":
            buffer = IsoBuffer.from("This is the fifth chunk");
            break;
        case "bARCFrpsK3UMt5sF+qMef+cEy":
            buffer = IsoBuffer.from("This is the sixth chunk");
            break;
        default:
            buffer = IsoBuffer.from((Math.random() + 10).toString(36));
    }
    return buffer;
};

const testDataSnapshotTree = (): ISnapshotTree => {
    return {
        id: "bBwkAAAAHAAAA",
        blobs: {
            ".metadata": "bARDL1ZPeQI2zfHTzfKCU1UMD",
            ".electedSummarizer": "bARA9BbRArlZutNXvx9Cwh82p",
        },
        trees: {
            ".protocol": {
                blobs: {
                    quorumMembers: "bARAtizraWCWTRnrEU+42Rd3v",
                    quorumProposals: "bARBkx1nses1pHL1vKnmFUfIC",
                    quorumValues: "bARAL2CXvHYOch_aQtJAJOker",
                    attributes: "bARBh5RGMbDk63p54G8Ck_fZr",
                },
                trees: {},
            },
            ".logTail": {
                blobs: {
                    logTail: "bARBQVYhT09O_nCX8UHYvVjOs",
                },
                trees: {},
            },
            ".serviceProtocol": {
                blobs: {
                    deli: "bARACZQs3THbp4b1DJBUClWVE",
                    scribe: "bARDx4nxrLuh5emlO_fzrFI1w",
                },
                trees: {},
            },
            ".app": {
                blobs: {},
                trees: {},
            },
            ".channels": {
                blobs: {},
                trees: {
                    rootDOId: {
                        blobs: {
                            ".component": "bARDwG7QN6wbf9NFJegbN+MLz",
                        },
                        trees: {
                            ".channels": {
                                blobs: {},
                                trees: {
                                    root: {
                                        blobs: {
                                            header: "bARC6V92fcUpQS5x9Dfp9QhpY",
                                            ".attributes":
                                                "bARCrSGHg4ftOX7n972YuLToI",
                                        },
                                        trees: {},
                                    },
                                    "f4cf9f85-0d22-43dd-b91b-52ee003d9d2c": {
                                        blobs: {
                                            summaryChunk_0:
                                                "bARDQwhaqJvqIS38b2zzuPGrL",
                                            summaryChunk_1:
                                                "bARArVXzvWHYQ6Pfvew4D73dG",
                                            summaryChunk_2:
                                                "bARCfsqYRo7Tcc4At3GrReF+8",
                                            summaryChunk_3:
                                                "bARBsGcltNqNYHWTuYNKrsmar",
                                            summaryChunk_4:
                                                "bARCfsqYRo7Tcc4At3GrReF98",
                                            summaryChunk_5:
                                                "bARCFrpsK3UMt5sF+qMef+cEy",
                                            properties:
                                                "bARBnr4B6zII40yfUVwo9IeHl",
                                            ".attributes":
                                                "bARAF6K8Tq5bC1lDV3Rd_bmdw",
                                        },
                                        trees: {},
                                    },
                                },
                            },
                        },
                    },
                },
            },
            gc: {
                blobs: {
                    __gc_root: "bARD6h3kNGCrEMswGjRn_cSKi",
                },
                trees: {},
            },
        },
    };
};

const testDataSummaryTree = (): ISummaryTree => {
    return {
        type: SummaryType.Tree,
        tree: {
            ".channels": {
                type: SummaryType.Tree,
                tree: {
                    rootDOId: {
                        type: SummaryType.Tree,
                        tree: {
                            ".channels": {
                                type: SummaryType.Tree,
                                tree: {
                                    root: {
                                        type: SummaryType.Handle,
                                        handle: "/.channels/rootDOId/.channels/root",
                                        handleType: 1,
                                    },
                                    "2577dc32-1c82-4dd2-a3ce-f62433e74ae2": {
                                        type: 1,
                                        tree: {
                                            summaryChunk_0: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the first chunk"
                                                ),
                                            },
                                            summaryChunk_1: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the second chunk"
                                                ),
                                            },
                                            summaryChunk_2: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the third chunk"
                                                ),
                                            },
                                            summaryChunk_3: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the fourth chunk"
                                                ),
                                            },
                                            summaryChunk_4: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the fifth chunk"
                                                ),
                                            },
                                            summaryChunk_5: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the sixth chunk"
                                                ),
                                            },
                                            summaryChunk_6: {
                                                type: SummaryType.Blob,
                                                content: IsoBuffer.from(
                                                    "This is the seventh chunk"
                                                ),
                                            },
                                            properties: {
                                                type: SummaryType.Blob,
                                                content:
                                                    '{"branchGuid":"2577dc32-1c82-4dd2-a3ce-f62433e74ae2","summaryMinimumSequenceNumber":3,"useMH":false,"numChunks":1}',
                                            },
                                            ".attributes": {
                                                type: SummaryType.Blob,
                                                content:
                                                    '{"type":"PropertyTree:01EP5J4Y6C284JR6ATVPPHRJ4E","snapshotFormatVersion":"0.1","packageVersion":"0.1"}',
                                            },
                                        },
                                    },
                                },
                            },
                            ".component": {
                                type: SummaryType.Blob,
                                content:
                                    '{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
                            },
                        },
                    },
                },
            },
            ".metadata": {
                type: SummaryType.Blob,
                content:
                    '{"createContainerRuntimeVersion":"2.0.0-internal.2.1.0","createContainerTimestamp":1666109124779,"summaryNumber":2,"summaryFormatVersion":1,"gcFeature":1,"sweepEnabled":false,"message":{"clientId":null,"clientSequenceNumber":-1,"minimumSequenceNumber":3,"referenceSequenceNumber":-1,"sequenceNumber":5,"timestamp":1666109133184,"type":"join"}}',
            },
            ".electedSummarizer": {
                type: SummaryType.Blob,
                content:
                    '{"electedClientId":"8193eb47-0101-4ae9-add6-3507cbd627b4","electedParentId":"9d41c525-53fd-47ef-a26b-626dd40024b0","electionSequenceNumber":5}',
            },
            gc: {
                type: SummaryType.Tree,
                tree: {
                    __gc_root: {
                        type: SummaryType.Blob,
                        content:
                            '{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/rootDOId":{"outboundRoutes":["/rootDOId/2577dc32-1c82-4dd2-a3ce-f62433e74ae2","/rootDOId/root"]},"/rootDOId/2577dc32-1c82-4dd2-a3ce-f62433e74ae2":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/rootDOId","/rootDOId/2577dc32-1c82-4dd2-a3ce-f62433e74ae2"]}}}',
                    },
                },
            },
        },
    };
};
