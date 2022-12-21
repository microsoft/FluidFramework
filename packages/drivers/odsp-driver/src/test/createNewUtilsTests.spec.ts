/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import * as api from "@fluidframework/protocol-definitions";
import { bufferToString } from "@fluidframework/common-utils";
import {
    IFileEntry,
    IOdspResolvedUrl,
    ShareLinkTypes,
    ISharingLinkKind,
    SharingLinkRole,
    SharingLinkScope,
} from "@fluidframework/odsp-driver-definitions";
import { TelemetryNullLogger } from "@fluidframework/telemetry-utils";
import { convertCreateNewSummaryTreeToTreeAndBlobs } from "../createNewUtils";
import { createNewFluidFile } from "../createFile";
import { EpochTracker } from "../epochTracker";
import { getHashedDocumentId, ISnapshotContents } from "../odspPublicUtils";
import { INewFileInfo, createCacheSnapshotKey } from "../odspUtils";
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
        await epochTracker.removeEntries().catch(() => { });
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
                true /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
            ),
            { itemId: "itemId1", id: "Summary handle" },
            { "x-fluid-epoch": "epoch1" },
        );
        const snapshot = await epochTracker.get(createCacheSnapshotKey(odspResolvedUrl));
        test(snapshot);
        await epochTracker.removeEntries().catch(() => { });
    });

    it("Should save CSL specific share link information received during createNewFluidFile", async () => {
        const createLinkType = ShareLinkTypes.csl;
        newFileParams.createLinkType = createLinkType;

        // Test that sharing link is set appropriately when it is received in the response from ODSP
        const mockSharingLink = "mockSharingLink";
        const mockSharingId = "mockSharingId";
        let odspResolvedUrl = await mockFetchOk(
            async () => createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                false /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
                undefined /* isClpCompliantApp */,
                false /* enableSingleRequestForShareLinkWithCreate */,
                true /* enableShareLinkWithCreate */,
            ),
            {
                itemId: "mockItemId",
                id: "mockId",
                sharingLink: mockSharingLink,
                sharingLinkErrorReason: undefined,
                sharing: {
                    shareId: mockSharingId,
                    shareLink: {
                        scope: "organization",
                        type: "edit",
                        webUrl: "webUrl",
                    },
                },
            },
            { "x-fluid-epoch": "epoch1" },
        );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            link: mockSharingLink,
            shareId: mockSharingId,
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
                false /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
                undefined /* isClpCompliantApp */,
                false /* enableSingleRequestForShareLinkWithCreate */,
                true /* enableShareLinkWithCreate */,
            ),
            {
                itemId: "mockItemId",
                id: "mockId",
                sharingLink: undefined,
                sharingLinkErrorReason: mockError,
                sharing: { error: {} },
            },
            { "x-fluid-epoch": "epoch1" },
        );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            link: undefined,
            shareId: undefined,
            error: mockError,
        });
        await epochTracker.removeEntries().catch(() => { });
    });

    it("Should save 'sharing' information received during createNewFluidFile", async () => {
        const createLinkType: ISharingLinkKind = { scope: SharingLinkScope.users, role: SharingLinkRole.edit };
        newFileParams.createLinkType = createLinkType;

        // Test that sharing link is set appropriately when it is received in the response from ODSP
        const mockSharingLinkData = {
            localizedDescription: "Specific users with the link can view",
            iconUrl: "https://mock.icon.url",
            scope: "organization",
            type: "view",
            webUrl: "https://mock.url",
            blocksDownload: false,
            createOnly: false,
            status: "Created",
            createdDateTime: "2022-05-18T02:58:17.0256105Z",
        };
        const mockSharingData = {
            shareId: "c40e6f0a-666e-48bf-9509-066900a73b2b",
            sharingLink: mockSharingLinkData,
        };
        let odspResolvedUrl = await mockFetchOk(
            async () => createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                false /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
                undefined /* isClpCompliantApp */,
                true /* enableSingleRequestForShareLinkWithCreate */,
                false /* enableShareLinkWithCreate */,
            ),
            { itemId: "mockItemId", id: "mockId", sharing: mockSharingData, sharingLinkErrorReason: undefined },
            { "x-fluid-epoch": "epoch1" },
        );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            shareId: mockSharingData.shareId,
            link: {
                role: mockSharingData.sharingLink.type,
                ...mockSharingData.sharingLink,
            },
            error: undefined,
        });

        // Test that error message is set appropriately when it is received in the response from ODSP
        const mockSharingError = {
            error: {
                code: "invalidRequest",
                message: "Invalid request",
                innerError: {
                    code: "invalidRequest",
                    errorType: "expected",
                    message: "The CreateLinkScope 'asdf' is not valid or supported.",
                    stackTrace: "Exceptions.InvalidRequestException",
                    throwSite: "",
                },
            },
        };
        odspResolvedUrl = await mockFetchOk(
            async () => createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                false /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
                undefined /* isClpCompliantApp */,
                true /* enableSingleRequestForShareLinkWithCreate */,
                false /* enableShareLinkWithCreate */,
            ),
            { itemId: "mockItemId", id: "mockId", sharingLinkErrorReason: "mockError", sharing: mockSharingError },
            { "x-fluid-epoch": "epoch1" },
        );
        assert.deepStrictEqual(odspResolvedUrl.shareLinkInfo?.createLink, {
            type: createLinkType,
            shareId: undefined,
            link: undefined,
            error: mockSharingError.error,
        });
        await epochTracker.removeEntries().catch(() => { });
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
                true /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
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
                true /* createNewCaching */,
                false /* forceAccessTokenViaAuthorizationHeader */,
                undefined /* isClpCompliantApp */,
            ),
            { itemId: "itemId1", id: "Summary handle" },
            { "x-fluid-epoch": "epoch1" },
        );
        assert(!odspResolvedUrl2.isClpCompliantApp, "isClpCompliantApp should be falsy");
        await epochTracker.removeEntries().catch(() => { });
    });
});
