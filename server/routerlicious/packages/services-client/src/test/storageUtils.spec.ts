/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { stringToBuffer } from "@fluidframework/common-utils";
import { buildTreePath, convertWholeFlatSummaryToSnapshotTreeAndBlobs } from "../storageUtils";

import {
    IWholeFlatSummaryBlob,
    IWholeFlatSummary,
    IWholeFlatSummaryTree,
    IWholeFlatSummaryTreeEntry,
} from "../storageContracts";

const summaryBlobs: IWholeFlatSummaryBlob[] = [
    {
        id: "bARCTBK4PQiMLVK2gR5hPRkId",
        content: "[]",
        encoding: "utf-8",
        size: 2
    },
    {
        id: "bARCfbIYtOyFwf1+nY75C4UFc",
        content: "[]",
        encoding: "utf-8",
        size: 2
    },
    {
        id: "bARAL2CXvHYOch_aQtJAJOker",
        content: "[]",
        encoding: "utf-8",
        size: 2
    },
]

const treeEntries: IWholeFlatSummaryTreeEntry[] = [
    {
        path: ".protocol",
        type: "tree",
        unreferenced: null
    },
    {
        id: "bARCTBK4PQiMLVK2gR5hPRkId",
        path: ".protocol/attributes",
        type: "blob",
    },
    {
        id: "bARAL2CXvHYOch_aQtJAJOker",
        path: ".protocol/quorumValues",
        type: "blob",
    },
    {
        path: ".app",
        type: "tree",
        unreferenced: null
    },
    {
        path: ".app/.channels",
        type: "tree",
        unreferenced: null
    },
    {
        path: ".app/.channels/rootDOId",
        type: "tree",
        unreferenced: null
    },
    {
        id: "bARCfbIYtOyFwf1+nY75C4UFc",
        path: ".app/.metadata",
        type: "blob",
    },
]

const flatSummary: IWholeFlatSummary = {
    id: "bBwAAAAAHAAAA",
    trees: [
        {
            id: "bBwAAAAAHAAAA",
            sequenceNumber: 0,
            entries: treeEntries
        }
    ],
    blobs: summaryBlobs,
}

const snapshotTree = {
    blobs: {
        ".metadata": "bARCfbIYtOyFwf1+nY75C4UFc",
    },
    id: "bBwAAAAAHAAAA",
    trees: {
        ".app": {
            blobs: {},
            trees: {},
            unreferenced: null
        },
        ".channels": {
            blobs: {},
            trees: {
                rootDOId: {
                    blobs: {},
                    trees: {},
                    unreferenced: null,
                }
            },
            unreferenced: null,
        },
        ".protocol": {
            blobs: {
                attributes: "bARCTBK4PQiMLVK2gR5hPRkId",
                quorumValues: "bARAL2CXvHYOch_aQtJAJOker",
            },
            trees: {},
            unreferenced: null,
        }
    }
}

const snapshotTreeWithoutPrefixStrip ={
    blobs: {},
    id: "bBwAAAAAHAAAA",
    trees: {
        ".app": {
            blobs: {
                ".metadata": "bARCfbIYtOyFwf1+nY75C4UFc",
            },
            trees: {
                ".channels": {
                    blobs: {},
                    trees: {
                        rootDOId: {
                            blobs: {},
                            trees: {},
                            unreferenced: null,
                        }
                    },
                    unreferenced: null,
                },
            },
            unreferenced: null
        },
        ".protocol": {
            blobs: {
                attributes: "bARCTBK4PQiMLVK2gR5hPRkId",
                quorumValues: "bARAL2CXvHYOch_aQtJAJOker",
            },
            trees: {},
            unreferenced: null,
        }
    }
}

describe("Storage Utils", () => {
    describe("buildTreePath()", () => {
        it("trims leading slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app", "/.handle"),
                "ABC/.app/.handle",
            );
        });

        it("trims trailing slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app/", ".handle"),
                "ABC/.app/.handle",
            );
        });

        it("removes blank nodes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app", "", ".handle"),
                "ABC/.app/.handle",
            );
        });

        it("does not trim internal slashes", () => {
            assert.strictEqual(
                buildTreePath("ABC", ".app/", ".handle/component/"),
                "ABC/.app/.handle/component",
            );
        });
    });

    describe("convertWholeFlatSummaryToSnapshotTreeAndBlobs()", () => {
        const blobs = new Map<string, ArrayBuffer>();
        let flatSummaryTree: IWholeFlatSummaryTree;
        let sequenceNumber: number;

        beforeEach(() => {
            for (const b of summaryBlobs) {
                blobs.set(b.id, stringToBuffer(b.content, b.encoding ?? "utf-8"));
            }
            flatSummaryTree = flatSummary.trees && flatSummary.trees[0];
            sequenceNumber = flatSummaryTree?.sequenceNumber;
        });

        it("converts while stripping .app prefix", () => {
            assert.deepStrictEqual(
                convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary),
                {
                    blobs,
                    snapshotTree,
                    sequenceNumber,
                },
            );
        });

        it("converts without stripping .app prefix", () => {
            assert.deepStrictEqual(
                convertWholeFlatSummaryToSnapshotTreeAndBlobs(flatSummary, ""),
                {
                    blobs,
                    snapshotTree: snapshotTreeWithoutPrefixStrip,
                    sequenceNumber,
                },
            );
        });
    });
});
