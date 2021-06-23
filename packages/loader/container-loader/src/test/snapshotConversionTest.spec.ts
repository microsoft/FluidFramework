/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
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
                        "unref": {
                            type: SummaryType.Tree,
                            tree: {},
                            unreferenced: true,
                        },
                    },
                },
            },
        };
        const { snapshotTree } = convertProtocolAndAppSummaryToSnapshotTree(protocolSummary, appSummary);

        assert.strictEqual(Object.keys(snapshotTree.trees).length, 2, "2 trees should be there");
        assert.strictEqual(Object.keys(snapshotTree.trees[".protocol"].blobs).length, 4,
            "2 protocol blobs should be there(4 mappings)");

        // Validate the ".component" blob.
        const defaultDataStoreBlobId = snapshotTree.trees.default.blobs[".component"];
        assert.strictEqual(
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees.default.blobs[defaultDataStoreBlobId])),
           "defaultDataStore",
           "The .component blob's content is incorrect",
        );

        // Validate "root" sub-tree.
        const rootAttributesBlobId = snapshotTree.trees.default.trees.root.blobs.attributes;
        assert.strictEqual(
            JSON.parse(fromBase64ToUtf8(snapshotTree.trees.default.trees.root.blobs[rootAttributesBlobId])),
            "rootattributes",
            "The root sub-tree's content is incorrect",
        );
        assert.strictEqual(
            snapshotTree.trees.default.trees.root.unreferenced,
            undefined,
            "The root sub-tree should not be marked as unreferenced",
        );

        // Validate "unref" sub-tree.
        assert.strictEqual(
            snapshotTree.trees.default.trees.unref.unreferenced,
            true,
            "The unref sub-tree should be marked as unreferenced",
        );
    });
});
