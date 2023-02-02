/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IOdspResolvedUrl,
    ICacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import { TelemetryNullLogger, MockLogger } from "@fluidframework/telemetry-utils";
import { delay } from "@fluidframework/common-utils";
import { EpochTracker, defaultCacheExpiryTimeoutMs } from "../epochTracker";
import {
	IOdspSnapshot,
	HostStoragePolicyInternal,
	IVersionedValueWithEpoch,
	persistedCacheValueVersion,
} from "../contracts";
import { LocalPersistentCache, NonPersistentCache, snapshotPrefetchCacheKeyFromEntry } from "../odspCache";
import { createCacheSnapshotKey, INewFileInfo } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId, ISnapshotContents } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService, defaultSummarizerCacheExpiryTimeout } from "../odspDocumentStorageManager";
import { prefetchLatestSnapshot } from "../prefetchLatestSnapshot";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch";
import { FetchSource } from "@fluidframework/driver-definitions";

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
        type: 'New',
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

    describe("Tests for caching of different file versions", () => {
        beforeEach(async () => {
            localCache = createUtLocalCache();
            const resolvedUrlWithFileVersion: IOdspResolvedUrl = {
                siteUrl,
                driveId,
                itemId,
                odspResolvedUrl: true,
                fileVersion: "2",
                type: "fluid",
                url: "",
                hashedDocumentId,
                endpoints: {
                    snapshotStorageUrl: "fake",
                    attachmentPOSTStorageUrl: "",
                    attachmentGETStorageUrl: "",
                    deltaStorageUrl: ""
                },
                tokens: {},
                fileName: "",
                summarizer: false,
                id: "id"
            }  ;

            epochTracker = new EpochTracker(
                localCache,
                {
                    docId: hashedDocumentId,
                    resolvedUrl,
                },
                new TelemetryNullLogger(),
            );

            service = new OdspDocumentStorageService(
                resolvedUrlWithFileVersion,
                async (_options) => "token",
                logger,
                true,
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

        it("should not fetch from cache with the same snapshot", async () => {
            const latestContent: ISnapshotContents = {
                snapshotTree: {
                    id: "WrongId",
                    blobs: {},
                    trees: {},
                },
                blobs: new Map(),
                ops: [],
                sequenceNumber: 0,
                latestSequenceNumber: 0,
            };

            const latestValue: IVersionedValueWithEpoch = {
                value: { ...latestContent, cacheEntryTime: Date.now() },
                fluidEpoch: "epoch1",
                version: persistedCacheValueVersion,
            };

            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl },
            };

            await localCache.put(cacheEntry, latestValue);

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => {
                    await delay(50); // insure cache response is faster
                    return createResponse(
                        { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                        odspSnapshot,
                        200,
                    );
                },
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
        });
    });

    describe("Tests for regular snapshot fetch", () => {
        let resolved: IOdspResolvedUrl;
        let mockLogger: MockLogger;
        let snapshotPrefetchCacheKey: string;
        beforeEach(async () => {
            mockLogger = new MockLogger();
            localCache = createUtLocalCache();
            resolved = await resolver.resolve({ url: odspUrl });

            epochTracker = new EpochTracker(
                localCache,
                {
                    docId: hashedDocumentId,
                    resolvedUrl: resolved,
                },
                mockLogger,
            );
            snapshotPrefetchCacheKey = snapshotPrefetchCacheKeyFromEntry(createCacheSnapshotKey(resolved));
            service = new OdspDocumentStorageService(
                resolved,
                async (_options) => "token",
                mockLogger,
                true,
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
            nonPersistentCache.snapshotPrefetchResultCache?.remove(snapshotPrefetchCacheKey);
        });

        it("prefetching snapshot should result in snapshot source as prefetched if cache throws", async () => {
            // overwriting get() to make cache fetch throw
            localCache.get = async () => {
                throw new Error("testing");
            };

            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );
            assert(nonPersistentCache.snapshotPrefetchResultCache?.has(snapshotPrefetchCacheKey), "non persistent cache should have the snapshot");
            const version = await service.getVersions(null, 1);
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end")).length === 1, "1 Obtain snapshot event should be there");
            assert(mockLogger.matchEvents([{ eventName: "ObtainSnapshot_end", method: "prefetched" }]), "Source should be prefetched");
        });

        it("prefetching snapshot should result in snapshot source as network if both cache and prefetch throws", async () => {
            // overwriting get() to make cache fetch throw
            localCache.get = async () => {
                throw new Error("testing");
            };

            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                notFound,
            );

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end")).length === 1, "1 Obtain snapshot event should be there");
            assert(mockLogger.matchEvents([{ eventName: "ObtainSnapshot_end", method: "network" }]), "Source should be network");
        });

        it("prefetching snapshot should result in snapshot source as cache or network if prefetch throws and cache contains the response", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: resolved.hashedDocumentId, resolvedUrl: resolved },
            };
            await localCache.put(cacheEntry, value);

            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                notFound,
            );

            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end")).length === 1, "1 Obtain snapshot event should be there");
            const method = mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))[0].method as string;
            assert(method === "cache" || method === "network", "Source should be cache or network");
        });

        it("prefetching snapshot should result in snapshot source as either cache or prefetch if both pass", async () => {
            const cacheEntry: ICacheEntry = {
                key: "",
                type: "snapshot",
                file: { docId: hashedDocumentId, resolvedUrl: resolved },
            };
            await localCache.put(cacheEntry, value);

            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            const version = await service.getVersions(null, 1);
            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end")).length === 1, "1 Obtain snapshot event should be there");
            const method = mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))[0].method as string;
            assert(method === "cache" || method === "prefetched", "Source should be cache or prefetched");
        });

        it("prefetching snapshot should result in epoch error if different from what is already present", async () => {
            // overwriting get() to make cache fetch throw
            localCache.get = async () => {
                throw new Error("testing");
            };
            epochTracker.setEpoch("epoch1", true, "cache");
            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch2", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert(nonPersistentCache.snapshotPrefetchResultCache?.has(snapshotPrefetchCacheKey), "non persistent cache should have the snapshot");
            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("PrefetchSnapshotError")).length === 1, "Snapshot prefetch has different epoch");
            assert(mockLogger.matchEvents([
                { eventName: "PrefetchSnapshotError", errorType: "fileOverwrittenInStorage", error: "Epoch mismatch" },
                { eventName: "ObtainSnapshot_end", method: "network" },
            ]), "unexpected events");
        });

        
        it("prefetching snapshot should result in epoch error if different from what is already present, fetch is not from cache", async () => {
            epochTracker.setEpoch("epoch1", true, "cache");
            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch2", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert(nonPersistentCache.snapshotPrefetchResultCache?.has(snapshotPrefetchCacheKey), "non persistent cache should have the snapshot");
            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1, "test", FetchSource.noCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("PrefetchSnapshotError")).length === 1, "Snapshot prefetch has different epoch");
            assert(mockLogger.matchEvents([
                { eventName: "PrefetchSnapshotError", errorType: "fileOverwrittenInStorage", error: "Epoch mismatch" },
                { eventName: "ObtainSnapshot_end", method: "networkOnly" },
            ]), "unexpected events");
        });

        it("prefetching snapshot should result in epoch error if different from what is already present, no concurrent fetch", async () => {
            service["hostPolicy"].concurrentSnapshotFetch = false;
            epochTracker.setEpoch("epoch1", true, "cache");
            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch2", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert(nonPersistentCache.snapshotPrefetchResultCache?.has(snapshotPrefetchCacheKey), "non persistent cache should have the snapshot");
            const version = await mockFetchSingle(
                async () => service.getVersions(null, 1),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.events.filter((event) => event.eventName.includes("PrefetchSnapshotError")).length === 1, "Snapshot prefetch has different epoch");
            assert(mockLogger.matchEvents([
                { eventName: "PrefetchSnapshotError", errorType: "fileOverwrittenInStorage", error: "Epoch mismatch" },
                { eventName: "ObtainSnapshot_end", method: "network" },
            ]), "unexpected events");
        });

        it("prefetching snapshot should be successful from prefetching, no concurrent fetch", async () => {
            service["hostPolicy"].concurrentSnapshotFetch = false;
            epochTracker.setEpoch("epoch1", true, "cache");
            await mockFetchSingle(
                async () => prefetchLatestSnapshot(resolved, async (_options) => "token", localCache, true, mockLogger, undefined, false, undefined, undefined, nonPersistentCache.snapshotPrefetchResultCache),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1", "content-type": "application/json" },
                    odspSnapshot,
                    200,
                ),
            );

            assert(nonPersistentCache.snapshotPrefetchResultCache?.has(snapshotPrefetchCacheKey), "non persistent cache should have the snapshot");
            const version = await service.getVersions(null, 1);

            assert.deepStrictEqual(version, expectedVersion, "incorrect version");
            assert(mockLogger.matchEvents([
                { eventName: "ObtainSnapshot_end", method: "prefetched" },
            ]), "unexpected events");
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
                true,
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
