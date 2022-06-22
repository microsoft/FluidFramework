/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stub } from "sinon";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { EpochTracker } from "../epochTracker";
import { HostStoragePolicyInternal } from "../contracts";
import * as fetchSnapshotImport from "../fetchSnapshot";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache";
import { INewFileInfo, IOdspResponse } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId, ISnapshotContents } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";

const createUtLocalCache = () => new LocalPersistentCache();

describe("Tests for snapshot fetch headers", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    const filePath = "path";
    let epochTracker: EpochTracker;
    let localCache: LocalPersistentCache;
    let hashedDocumentId: string;
    let service: OdspDocumentStorageService;

    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;

    const newFileParams: INewFileInfo = {
        driveId,
        siteUrl: "https://www.localhost.xxx",
        filePath,
        filename: "filename",
    };

    const hostPolicy: HostStoragePolicyInternal = {
        snapshotOptions: { timeout: 2000, mds: 1000 },
        summarizerClient: true,
        fetchBinarySnapshotFormat: false,
        concurrentSnapshotFetch: true,
    };

    const resolver = new OdspDriverUrlResolver();
    const nonPersistentCache = new NonPersistentCache();
    const logger = new TelemetryNullLogger();
    const odspUrl = createOdspUrl({ ...newFileParams, itemId, dataStorePath: "/" });

    const content: ISnapshotContents = {
        snapshotTree: {
            id: "id",
            blobs: {},
            trees: {},
        },
        blobs: new Map(),
        ops: [],
        sequenceNumber: 0,
        latestSequenceNumber: 0,
    };
    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
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
            new TelemetryNullLogger(),
        );
        epochTracker.setEpoch("epoch1", true, "test");
        const resolved = await resolver.resolve({ url: odspUrl });
        service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker },
            hostPolicy,
            epochTracker,
            async () => { return {}; },
        );
    });

    afterEach(async () => {
        await epochTracker.removeEntries().catch(() => { });
    });

    it("Mds limit check in fetch snapshot", async () => {
        let success = false;
        async function mockDownloadSnapshot<T>(_response: Promise<any>, callback: () => Promise<T>): Promise<T> {
            const getDownloadSnapshotStub = stub(fetchSnapshotImport, "downloadSnapshot");
            getDownloadSnapshotStub.returns(_response);
            try {
                return await callback();
            } finally {
                assert(getDownloadSnapshotStub.args[0][3]?.mds === undefined, "mds should be undefined");
                success = true;
                getDownloadSnapshotStub.restore();
            }
        }
        const odspResponse: IOdspResponse<ISnapshotContents> = {
            content,
            duration: 10,
            headers: new Map([["x-fluid-epoch", "epoch1"]]),
            propsToLog: {},
        };
        const response = {
            odspSnapshotResponse: odspResponse,
            requestHeaders: {},
            requestUrl: siteUrl,
        };
        try {
            await mockDownloadSnapshot(
                Promise.resolve(response),
                async () => service.getVersions(null, 1),
            );
        } catch (error) { }
        assert(success, "mds limit should not be set!!");
    });
});
