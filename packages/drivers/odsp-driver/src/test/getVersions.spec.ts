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
import {
    IOdspSnapshot,
    HostStoragePolicyInternal,
    IVersionedValueWithEpoch,
    persistedCacheValueVersion,
} from "../contracts";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache";
import { INewFileInfo, ISnapshotContents } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(10000);

describe("Tests for snapshot fetch", () => {
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
        summarizerClient: false,
        fetchBinarySnapshotFormat: false,
        // for testing both network and cache fetch
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

    const content: ISnapshotContents = {
        snapshotTree: {
            id: "id",
            blobs: {},
            commits: {},
            trees: {},
        },
        blobs: new Map(),
        ops: [],
        sequenceNumber: 0,
    };

    const value: IVersionedValueWithEpoch =
    {value: content, fluidEpoch: "epoch1", version: persistedCacheValueVersion };

    const expectedVersion = [{ id: "id", treeId: undefined!}];

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

        const resolved = await resolver.resolve({ url: odspUrl });
        service = new OdspDocumentStorageService(
            resolved,
            async (_options) => "token",
            logger,
            true,
            { ...nonPersistentCache, persistedCache: epochTracker},
            hostPolicy,
            epochTracker,
            async () => { return {}; },
            );
    });

    it("cache fetch throws and network fetch succeeds", async () => {
        // overwriting get() to make cache fetch throw
        localCache.get = async () => {
            throw new Error("testing");
        };

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            async () => createResponse({ "x-fluid-epoch": "epoch1" }, odspSnapshot, 200),
        );

        assert.deepStrictEqual(version, expectedVersion, "incorrect version");
    });

    it("cache fetch succeeds and network fetch succeeds", async () => {
        const cacheEntry: ICacheEntry = {
            key:"",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        await localCache.put(cacheEntry, value);

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            async () => createResponse({ "x-fluid-epoch": "epoch1" }, odspSnapshot, 200),
        );
        assert.deepStrictEqual(version, expectedVersion, "incorrect version");
    });

    it("cache fetch throws and network fetch throws", async () => {
        // overwriting get() to make cache fetch throw
        localCache.get = async () => {
            throw new Error("testing");
        };

        let isCaught = false;
        try { await mockFetchSingle(
            async () => service.getVersions(null,1),
            // 404 response expected so network fetch throws
            notFound,
        );
        } catch (error) {
            isCaught = true;
            assert.strictEqual(error.message, "odspFetchError [404] (undefined)", "incorrect error message");
        }
        // making sure network fetch did throw and catch block was executed
        assert(isCaught, "catch block was not executed");
    });

    it("cache fetch succeeds and network fetch throws", async () => {
        const cacheEntry: ICacheEntry = {
            key:"",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        await localCache.put(cacheEntry, value);

        const version = await mockFetchSingle(
            async () => service.getVersions(null,1),
            // 404 response expected so network fetch throws
            notFound,
        );
        assert.deepStrictEqual(version, expectedVersion, "incorrect version");
    });

    it("empty cache and network fetch throws", async () => {
        let isCaught = false;
        try {
            await mockFetchSingle(
            async () => service.getVersions(null,1),
            // 404 response expected so network fetch throws
            notFound,
            );
        } catch (error) {
            isCaught = true;
            assert.strictEqual(error.message, "odspFetchError [404] (undefined)", "incorrect error message");
        }
        // making sure network fetch did throw and catch block was executed
        assert(isCaught, "catch block was not executed");
    });
});
