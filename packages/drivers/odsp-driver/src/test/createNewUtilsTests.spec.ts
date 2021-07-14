/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as api from "@fluidframework/protocol-definitions";
import { convertSummaryTreeToIOdspSnapshot } from "../createNewUtils";
import { IOdspSnapshotTreeEntryTree } from "../contracts";

describe("Create New Utils Tests", () => {
    beforeEach(() => {
    });

    it("Should convert as expected and check contents", async () => {
        const rootBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("root"),
        };
        const componentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: JSON.stringify("component"),
        };
        const contentBlob: api.ISummaryBlob = {
            type: api.SummaryType.Blob,
            content: "[]",
        };
        const rootBlobPath = "default/root";
        const componentBlobPath = "default/component";
        const contentBlobPath = "contentTree/contentBlob";
        const appSummary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {
                default: {
                    type: api.SummaryType.Tree,
                    tree: {
                        component: componentBlob,
                        root: rootBlob,
                    },
                },
                contentTree: {
                    type: api.SummaryType.Tree,
                    tree: {
                        contentBlob,
                    },
                    unreferenced: true,
                },
            },
        };

        const odspSnapshot = convertSummaryTreeToIOdspSnapshot(appSummary);
        assert.strictEqual(odspSnapshot.trees.length, 1, "1 main tree should be there");
        assert.strictEqual(odspSnapshot.blobs?.length, 3, "3 blobs should be there");

        const mainTree = odspSnapshot.trees[0];
        assert.strictEqual(mainTree.id, odspSnapshot.id, "Main tree id should match");

        const blobEntries: string[] = [];
        const treeEntries: IOdspSnapshotTreeEntryTree[] = [];
        mainTree.entries.forEach((entry) => {
            if (entry.type === "tree") {
                treeEntries.push(entry);
            } else {
                blobEntries.push(entry.path);
            }
        });

        // Validate that the snapshot has all the expected blob entries.
        assert.strictEqual(blobEntries.length, 3, "There should be 3 blob entries in the main tree");
        assert(blobEntries.includes(rootBlobPath), "Root blob should exist");
        assert(blobEntries.includes(componentBlobPath), "Component blob should exist");
        assert(blobEntries.includes(contentBlobPath), "Content blob should exist");

        // Validate that the snapshot has correct reference state for tree entries.
        assert.strictEqual(treeEntries.length, 2, "There should be 2 tree entries in the main tree");
        for (const treeEntry of treeEntries) {
            if (treeEntry.path === "default") {
                assert(treeEntry.unreferenced === undefined, "default tree entry should be referenced");
            } else {
                assert(treeEntry.unreferenced, "content tree entry should be unreferenced");
            }
        }
    });
});
