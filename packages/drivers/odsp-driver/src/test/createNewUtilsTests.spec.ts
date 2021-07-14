/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as api from "@fluidframework/protocol-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import { convertCreateNewSummaryTreeToIOdspSnapshot } from "../createNewUtils";
import { createNewFluidFile } from "../createFile";
import { IOdspSnapshotTreeEntryTree } from "../contracts";
import { EpochTracker } from "../epochTracker";
import { getHashedDocumentId } from "../odspPublicUtils";
import { INewFileInfo, createCacheSnapshotKey } from "../odspUtils";
import { LocalPersistentCache } from "../odspCache";
import { mockFetchOk } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(2000);

describe("Create New Utils Tests", () => {
    const createSummary = () => {
        const summary: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {},
        };

        summary.tree[".app"] = {
            type: api.SummaryType.Tree,
            tree: {
                attributes: {
                    type: api.SummaryType.Blob,
                    content: "testing",
                },
            },
        };
        summary.tree[".protocol"] = {
            type: api.SummaryType.Tree,
            tree: {
                attributes: {
                    type: api.SummaryType.Blob,
                    content: JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber: 0,
                        term: 1 }),
                },
            },
        };
        return summary;
    };

    beforeEach(() => {
    });

    it("Should convert as expected and check contents", async () => {
        const rootBlobPath = "default/root";
        const componentBlobPath = "default/component";
        const contentBlobPath = "contentTree/contentBlob";

        const odspSnapshot = convertCreateNewSummaryTreeToIOdspSnapshot(createSummary());
        assert.strictEqual(odspSnapshot.trees.length, 1, "1 main tree should be there");
        assert.strictEqual(odspSnapshot.blobs?.length, 2, "2 blobs should be there");

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
        assert.strictEqual(blobEntries.length, 2, "There should be 2 blob entries in the main tree");
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
    it("Should cache converted summary during createNewFluidFile", async () => {
        const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
        const driveId = "driveId";
        const itemId = "itemId";
        const hashedDocumentId = getHashedDocumentId(driveId, itemId);
        const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;
        const localCache = createUtLocalCache();
        // use null logger here as we expect errors
        const epochTracker = new EpochTracker(
            localCache,
            {
                docId: hashedDocumentId,
                resolvedUrl,
            },
            new TelemetryNullLogger());

        const filePath = "path";
        const newFileParams: INewFileInfo = {
            driveId,
            siteUrl: "https://www.localhost.xxx",
            filePath,
            filename: "filename",
        };

        const odspResolvedUrl = await mockFetchOk(
                async () =>createNewFluidFile(
                    async (_options) => "token",
                    newFileParams,
                    new TelemetryNullLogger(),
                    createSummary(),
                    epochTracker,
                ) ,
                { itemId: "itemId1"},
                { "x-fluid-epoch": "epoch1" },
                );
        const value = await epochTracker.get(createCacheSnapshotKey(odspResolvedUrl));
        const blobs = value.snapshot.blobs;
        assert.strictEqual(blobs.length, 2, "wrong length of blobs");
        assert.strictEqual(blobs[0].content, "testing", "wrong content of testing blob");

        const protocolSummary = createSummary().tree[".protocol"] as api.ISummaryTree;
        const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
        assert.strictEqual(documentAttributes.minimumSequenceNumber, 0, "wrong min sequence number");
        assert.strictEqual(documentAttributes.sequenceNumber, 0, "wrong sequence number");
        assert.strictEqual(documentAttributes.term, 1, "wrong term");
    });
});
