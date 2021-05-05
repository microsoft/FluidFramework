/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as api from "@fluidframework/protocol-definitions";
import { convertSummaryTreeToIOdspSnapshot } from "../createNewUtils";

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
                },
            },
        };

        const odspSnapshot = convertSummaryTreeToIOdspSnapshot(appSummary);
        assert.strictEqual(odspSnapshot.trees.length, 1, "1 main tree should be there");
        assert.strictEqual(odspSnapshot.blobs?.length, 3, "3 blobs should be there");

        const mainTree = odspSnapshot.trees[0];
        assert.strictEqual(mainTree.id, odspSnapshot.id, "Main tree id should match");
        assert.strictEqual(mainTree.entries.length, 5, "2 Trees and 3 blobs should be there");

        const treeEntries = new Set();
        mainTree.entries.forEach((treeEntry) => {
            treeEntries.add(treeEntry.path);
        });

        assert(treeEntries.has(rootBlobPath), "Root blob should exist");
        assert(treeEntries.has(componentBlobPath), "Component blob should exist");
        assert(treeEntries.has(contentBlobPath), "Content blob should exist");
    });
});
