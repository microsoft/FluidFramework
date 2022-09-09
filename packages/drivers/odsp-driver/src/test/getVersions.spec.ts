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
import { EpochTracker, defaultCacheExpiryTimeoutMs } from "../epochTracker";
import {
    IOdspSnapshot,
    HostStoragePolicyInternal,
    IVersionedValueWithEpoch,
    persistedCacheValueVersion,
} from "../contracts";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache";
import { INewFileInfo } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId, ISnapshotContents } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService, defaultSummarizerCacheExpiryTimeout } from "../odspDocumentStorageManager";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache();

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

    function GetHostStoragePolicyInternal(isSummarizer: boolean = false): HostStoragePolicyInternal {
        return {
            snapshotOptions: { timeout: 2000 },
            summarizerClient: isSummarizer,
            fetchBinarySnapshotFormat: false,
            // for testing both network and cache fetch
            concurrentSnapshotFetch: true,
        };
    }
    const resolver = new OdspDriverUrlResolver();
    const nonPersistentCache = new NonPersistentCache();
    const logger = new TelemetryNullLogger();
    const odspUrl = createOdspUrl({ ...newFileParams, itemId, dataStorePath: "/" });

    const odspSnapshot: IOdspSnapshot = {
        id: "id",
        trees: [{
            entries: [{ path: "path", type: "tree" }],
            id: "id",
            sequenceNumber: 1,
        }],
        blobs: [],
    };

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

    const value: IVersionedValueWithEpoch = {
        value: { ...content, cacheEntryTime: Date.now() },
        fluidEpoch: "epoch1",
        version: persistedCacheValueVersion,
    };

    // Set the cacheEntryTime to anything greater than the current maxCacheAge
    function valueWithExpiredCache(cacheExpiryTimeoutMs: number): IVersionedValueWithEpoch {
        const versionedValue: IVersionedValueWithEpoch = {
            value: { ...content, cacheEntryTime: Date.now() - cacheExpiryTimeoutMs - 1000 },
            fluidEpoch: "epoch1",
            version: persistedCacheValueVersion,
        };
        return versionedValue;
    }
    const expectedVersion = [{ id: "id", treeId: undefined! }];

    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
    });

    describe("Tests for regular snapshot fetch", () => {
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
                { ...nonPersistentCache, persistedCache: epochTracker },
                GetHostStoragePolicyInternal(),
                epochTracker,
                async () => { return {}; },
                () => "tenantid/id",
                undefined,
            );
        });

        afterEach(async () => {
            await epochTracker.removeEntries().catch(() => { });
        });

        it("cache fetch throws and network fetch succeeds", async () => {
            // overwriting get() to make cache fetch throw
            localCache.get = async () => {
                throw new Error("testing");
            };

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });

        it("cache fetch succeeds and network fetch succeeds", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, value);

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse({ "x-fluid-epoch": "epoch1" }, odspSnapshot, 200),
            );
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });

        it("cache fetch throws and network fetch throws", async () => {
            // overwriting get() to make cache fetch throw
            localCache.get = async () => {
                throw new Error("testing");
            };

            await assert.rejects(async () => {
                await mockFetchSingle(
                    async () => service.getVersions(null, 1),
                    // 404 response expected so network fetch throws
                    notFound,
                );
            }, /404/, "Expected 404 error to be thrown");
        });

        it("cache fetch succeeds and network fetch throws", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, value);

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                // 404 response expected so network fetch throws
                notFound,
            );
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });

        it("empty cache and network fetch throws", async () => {
            await assert.rejects(async () => {
                await mockFetchSingle(
                    async () => service.getVersions(null, 1),
                    // 404 response expected so network fetch throws
                    notFound,
                );
            }, /404/, "Expected 404 error to be thrown");
        });

        it("cache expires and network fetch succeeds", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, valueWithExpiredCache(defaultCacheExpiryTimeoutMs));

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });

        it("cache expires and network fetch throws", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, valueWithExpiredCache(defaultCacheExpiryTimeoutMs));

            await assert.rejects(async () => {
                await mockFetchSingle(
                    async () => service.getVersions(null, 1),
                    // 404 response expected so network fetch throws
                    notFound,
                );
            }, /404/, "Expected 404 error to be thrown");
        });
    });
    describe("Tests for snapshot fetch as Summarizer", () => {
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
                { ...nonPersistentCache, persistedCache: epochTracker },
                GetHostStoragePolicyInternal(true /* isSummarizer */),
                epochTracker,
                async () => { return {}; },
                () => "tenantid/id",
            );
        });

        afterEach(async () => {
            await epochTracker.removeEntries().catch(() => { });
        });

        it("cache expires and network fetch succeeds", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, valueWithExpiredCache(defaultSummarizerCacheExpiryTimeout));

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });

        it("cache fetch succeeds", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };
            await localCache.put(cacheEntry, valueWithExpiredCache(defaultSummarizerCacheExpiryTimeout - 5000));

            assert.notEqual(cacheEntry, undefined, "Cache should have been restored");
        });
    });
});
