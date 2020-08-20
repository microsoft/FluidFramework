/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Buffer } from "buffer";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { convertProtocolAndAppSummaryToSnapshotTree } from "../utils";

describe("Dehydrate Container", () => {
    it("Summary to snapshot conversion", async () => {
        const protocolSummary: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {
                attributes: {
                    type: SummaryType.Blob,
                    content: JSON.stringify("attributes"),
                },
                quorumValues: {
                    type: SummaryType.Blob,
                    content: JSON.stringify("quorumValues"),
                },
            },
        };
        const appSummary: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {
                default: {
                    type: SummaryType.Tree,
                    tree: {
                        ".component": {
                            type: SummaryType.Blob,
                            content: JSON.stringify("defaultDataStore"),
                        },
                        "root": {
                            type: SummaryType.Tree,
                            tree: {
                                attributes: {
                                    type: SummaryType.Blob,
                                    content: JSON.stringify("rootattributes"),
                                },
                            },
                        },
                    },
                },
            },
        };
        const snapshotTree = convertProtocolAndAppSummaryToSnapshotTree(protocolSummary, appSummary);

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 2, "2 trees should be there");
        assert.strictEqual(Object.keys(snapshotTree.trees[".protocol"].blobs).length, 4,
            "2 protocol blobs should be there(4 mappings)");
        const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
        assert.strictEqual(JSON.parse(Buffer.from(snapshotTree.trees.default.blobs[defaultDataStoreBlobId], "base64")
            .toString()), "defaultDataStore", "Default data store should be there");
        const rootAttributesBlobId = snapshotTree.trees.default.trees.root.blobs.attributes;
        assert.strictEqual(JSON.parse(Buffer.from(
            snapshotTree.trees.default.trees.root.blobs[rootAttributesBlobId], "base64").toString()),
            "rootattributes", "Default data store root attributes should be there");
    });
});
