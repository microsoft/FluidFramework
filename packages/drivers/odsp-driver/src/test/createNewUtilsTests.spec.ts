/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as api from "@fluidframework/protocol-definitions";
import { bufferToString, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IFileEntry, IOdspResolvedUrl, ShareLinkTypes } from "@fluidframework/odsp-driver-definitions";
import { convertCreateNewSummaryTreeToTreeAndBlobs } from "../createNewUtils";
import { createNewFluidFile } from "../createFile";
import { EpochTracker } from "../epochTracker";
import { getHashedDocumentId } from "../odspPublicUtils";
import { INewFileInfo, createCacheSnapshotKey, ISnapshotContents } from "../odspUtils";
import { LocalPersistentCache } from "../odspCache";
import { mockFetchOk } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache();

describe("Create New Utils Tests", () => {
    const documentAttributes: api.IDocumentAttributes = {
        minimumSequenceNumber: 0,
        sequenceNumber: 0,
        term: 1,
    };
    const blobContent = "testing";
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
                    content: blobContent,
                },
            },
        };
        summary.tree[".protocol"] = {
            type: api.SummaryType.Tree,
            tree: {
                attributes: {
                    type: api.SummaryType.Blob,
                    content: JSON.stringify(documentAttributes),
                },
            },
        };
        return summary;
    };

    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;
    const filePath = "path";
    let newFileParams: INewFileInfo;
    let hashedDocumentId: string;
    let localCache: LocalPersistentCache;
    let fileEntry: IFileEntry;
    let epochTracker: EpochTracker;

    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
        fileEntry = {
            docId: hashedDocumentId,
            resolvedUrl,
        };
    });

    beforeEach(async () => {
        localCache = createUtLocalCache();
        // use null logger here as we expect errors
        epochTracker = new EpochTracker(
            localCache,
            {
                docId: hashedDocumentId,
                resolvedUrl,
            },
            new TelemetryNullLogger());
        newFileParams = {
            driveId,
            siteUrl,
            filePath,
            filename: "filename",
        };
    });

    afterEach(async () => {
        await epochTracker.removeEntries().catch(() => {});
    });

    const test = (snapshot: ISnapshotContents) => {
        const snapshotTree = snapshot.snapshotTree;
        assert.strictEqual(Object.entries(snapshotTree.trees).length, 2, "app and protocol should be there");
        assert.strictEqual(snapshot.blobs.size, 2, "2 blobs should be there");

        const appTree = snapshotTree.trees[".app"];
        const protocolTree = snapshotTree.trees[".protocol"];
        assert(appTree !== undefined, "App tree should be there");
        assert(protocolTree !== undefined, "Protocol tree should be there");

        const appTreeBlobId = appTree.blobs.attributes;
        const appTreeBlobValBuffer = snapshot.blobs.get(appTreeBlobId);
        assert(appTreeBlobValBuffer !== undefined, "app blob value should exist");
        const appTreeBlobVal = bufferToString(appTreeBlobValBuffer, "utf8");
        assert(appTreeBlobVal === blobContent, "Blob content should match");

        const docAttributesBlobId = protocolTree.blobs.attributes;
        const docAttributesBuffer = snapshot.blobs.get(docAttributesBlobId);
        assert(docAttributesBuffer !== undefined, "protocol attributes blob value should exist");
        const docAttributesBlobValue = bufferToString(docAttributesBuffer, "utf8");
        assert(docAttributesBlobValue === JSON.stringify(documentAttributes), "Blob content should match");

        assert(snapshot.ops.length === 0, "No ops should be there");
        assert(snapshot.sequenceNumber === 0, "Seq number should be 0");
    };

    it("Should convert as expected and check contents", async () => {
        const snapshot = convertCreateNewSummaryTreeToTreeAndBlobs(createSummary(), "");
        test(snapshot);
    });

    it("Should cache converted summary during createNewFluidFile", async () => {
        const odspResolvedUrl = await mockFetchOk(
                async () => createNewFluidFile(
                    async (_options) => "token",
                    newFileParams,
                    new TelemetryNullLogger(),
                    createSummary(),
                    epochTracker,
                    fileEntry,
                    true,
                    false,
                ),
                { itemId: "itemId1", id: "Summary handle" },
                { "x-fluid-epoch": "epoch1" },
                );
        const snapshot = await epochTracker.get(createCacheSnapshotKey(odspResolvedUrl));
        test(snapshot);
        await epochTracker.removeEntries().catch(() => {});
    });

    it("Should save share link information received during createNewFluidFile", async () => {
        const createLinkType = ShareLinkTypes.csl;
        newFileParams.createLinkType = createLinkType;

        // Test that sharing link is set appropriately when it is received in the response from ODSP
        const mockSharingLink = "mockSharingLink";
        let odspResolvedUrl = await mockFetchOk(
                async () => createNewFluidFile(
                    async (_options) => "token",
                    newFileParams,
                    new TelemetryNullLogger(),
                    createSummary(),
                    epochTracker,
                    fileEntry,
                    false,
                    false,
                ),
                { itemId: "mockItemId", id: "mockId", sharingLink: mockSharingLink, sharingLinkErrorReason: undefined },
                { "x-fluid-epoch": "epoch1" },
                );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            link: mockSharingLink,
            error: undefined,
        });

        // Test that error message is set appropriately when it is received in the response from ODSP
        const mockError = "mockError";
        odspResolvedUrl = await mockFetchOk(
            async () => createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                false,
                false,
            ),
            { itemId: "mockItemId", id: "mockId", sharingLink: undefined, sharingLinkErrorReason: mockError },
            { "x-fluid-epoch": "epoch1" },
            );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            link: undefined,
            error: mockError,
        });
        await epochTracker.removeEntries().catch(() => {});
    });

    it("Should set the isClpCompliantApp prop on resolved url if already present", async () => {
        const odspResolvedUrl1 = await mockFetchOk(
                async () => createNewFluidFile(
                    async (_options) => "token",
                    newFileParams,
                    new TelemetryNullLogger(),
                    createSummary(),
                    epochTracker,
                    fileEntry,
                    true,
                    false,
                    true /* isClpCompliantApp */,
                ),
                { itemId: "itemId1", id: "Summary handle" },
                { "x-fluid-epoch": "epoch1" },
                );
        assert(odspResolvedUrl1.isClpCompliantApp, "isClpCompliantApp should be set");

        const odspResolvedUrl2 = await mockFetchOk(
            async () => createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                true,
                false,
                undefined /* isClpCompliantApp */,
            ),
            { itemId: "itemId1", id: "Summary handle" },
            { "x-fluid-epoch": "epoch1" },
            );
        assert(!odspResolvedUrl2.isClpCompliantApp, "isClpCompliantApp should be falsy");
        await epochTracker.removeEntries().catch(() => {});
    });
});
