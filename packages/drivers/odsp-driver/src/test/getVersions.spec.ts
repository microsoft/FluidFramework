/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import {
    IOdspResolvedUrl,
    ICacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import { EpochTracker } from "../epochTracker";
import { IVersionedValueWithEpoch,
    persistedCacheValueVersion,
    IOdspSnapshot,
    HostStoragePolicyInternal,
} from "../contracts";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache";
import { INewFileInfo } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch";

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

    const hostPolicy: HostStoragePolicyInternal = {
        summarizerClient: false,
        fetchBinarySnapshotFormat: false,
        concurrentSnapshotFetch: true,
    };

    const resolver = new OdspDriverUrlResolver();
    const nonPersistentCache = new NonPersistentCache();
    const logger = new TelemetryNullLogger();
    const odspUrl = createOdspUrl({... newFileParams, itemId, dataStorePath: "/"});

    const odspSnapshot: IOdspSnapshot = {
        id: "id",
        trees: [{
            entries:[ { path:"path", type:"tree" } ],
            id: "id",
            sequenceNumber: 1,
        }],
    };

    const value: IVersionedValueWithEpoch =
        {value: "val", fluidEpoch: "epoch1", version: persistedCacheValueVersion };

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

    it("cache fetch throws and network fetch succeeds", async () => {
        localCache.get = async () => {
            throw new Error("hello");
        };

        const resolved = await resolver.resolve({ url: odspUrl });
        const service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
            );

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            async () => createResponse({ "x-fluid-epoch": "epoch1" }, odspSnapshot, 200),
        );
        console.log(version);
    });

    it("cache fetch succeeds and network fetch succeeds", async () => {
        const resolved = await resolver.resolve({ url: odspUrl });

        const service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
        );

        const cacheEntry: ICacheEntry = {
            key:"",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        await localCache.put(cacheEntry, value);

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            async () => createResponse({ "x-fluid-epoch": "epoch1" }, odspSnapshot, 200),
        );
        console.log(version);
    });

    it("cache fetch throws and network fetch throws", async () => {
        localCache.get = async () => {
            throw new Error("hello");
        };

        const resolved = await resolver.resolve({ url: odspUrl });

        const service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
        );

        try { await mockFetchSingle(
            async () => service.getVersions(null,1),
            notFound,
        );
        } catch (error) {
            assert.strictEqual(error.message, "Error 404 (undefined)", "incorrect error message");
        }
    });

    it("cache fetch succeeds and network fetch throws", async () => {
        const resolved = await resolver.resolve({ url: odspUrl });

        const service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
        );

        const cacheEntry: ICacheEntry = {
            key:"",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        await localCache.put(cacheEntry, value);

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            notFound,
        );
        console.log(version);
    });

    it("empty cache and network fetch throws", async () => {
        const resolved = await resolver.resolve({ url: odspUrl });

        const service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
        );

        try {
            await mockFetchSingle(
            async () => service.getVersions(null,1),
            notFound,
            );
        } catch (error) {
            assert.strictEqual(error.message, "Error 404 (undefined)", "incorrect error message");
        }
    });
});
