/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TelemetryNullLogger } from "@fluidframework/common-utils";
import * as api from "@fluidframework/protocol-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import {
    IOdspResolvedUrl,
    IFileEntry,
} from "@fluidframework/odsp-driver-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache";
import { INewFileInfo } from "../odspUtils";
import { getHashedDocumentId } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";
import { createNewFluidFile } from "../createFile";
import { mockFetchOk } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(10000);

describe("Tests for Epoch Tracker", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    const filePath = "path";
    let epochTracker: EpochTracker;
    let localCache: LocalPersistentCache;
    let hashedDocumentId: string;
    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;

    const newFileParams: INewFileInfo = {
        driveId,
        siteUrl: "https://www.localhost.xxx",
        filePath,
        filename: "filename",
    };
    const documentAttributes: api.IDocumentAttributes = {
        branch: "",
        minimumSequenceNumber: 0,
        sequenceNumber: 0,
        term: 1,
    };

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
                    content: "blobContent",
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

    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
    });

    beforeEach(() => {
        localCache = createUtLocalCache();
        // use null logger here as we expect errors
        epochTracker = new EpochTracker(
            localCache,
            {
                docId: hashedDocumentId,
                resolvedUrl,
            },
            new TelemetryNullLogger());
    });

    it("test", async () => {
        const fileEntry: IFileEntry = {
            docId: hashedDocumentId,
            resolvedUrl,
        };
        const resolver = new OdspDriverUrlResolver();
        const request = resolver.createCreateNewRequest("https://www.localhost.xxx", driveId, "path", "fileName");
        const resolved = await resolver.resolve(request);
        const nonPersistentCache = new NonPersistentCache();
        const logger = new TelemetryNullLogger();
        ensureFluidResolvedUrl(resolved);

        // let odspResolvedUrl = getOdspResolvedUrl(resolved);
        const odspResolvedUrl = await mockFetchOk(
            async () =>createNewFluidFile(
                async (_options) => "token",
                newFileParams,
                new TelemetryNullLogger(),
                createSummary(),
                epochTracker,
                fileEntry,
                true,
            ) ,
            { itemId: "itemId1", id: "Summary handle"},
            { "x-fluid-epoch": "epoch1" },
            );
        const service = new OdspDocumentStorageService(
            odspResolvedUrl,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            { summarizerClient: false, fetchBinarySnapshotFormat: false, concurrentSnapshotFetch: true},
            epochTracker,
        );
        const expectedResponse: any = {
            context: "http://sp.devinstall/_api/v2.1/$metadata#",
            sequenceNumber: 1,
            sha: "shaxxshaxx",
            itemUrl: `http://fake.microsoft.com/_api/v2.1/drives/${driveId}/items/${itemId}`,
            driveId,
            itemId,
            id : "fakeSummaryHandle",
        };
        const v = await mockFetchOk(
            async () => service.getVersions(null,1),
            expectedResponse,
            { "x-fluid-epoch": "epoch2" },
        );
        console.log(v);
    });
});
