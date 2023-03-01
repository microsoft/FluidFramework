/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-floating-promises */
import { strict as assert } from "assert";
import { PromiseCache } from "@fluidframework/common-utils";
import {
	IOdspResolvedUrl,
	ICacheEntry,
	getKeyForCacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { FetchSource } from "@fluidframework/driver-definitions";
import {
	IOdspSnapshot,
	HostStoragePolicyInternal,
	IVersionedValueWithEpoch,
	persistedCacheValueVersion,
} from "../contracts";
import { IPrefetchSnapshotContents, LocalPersistentCache } from "../odspCache";
import { createCacheSnapshotKey, INewFileInfo } from "../odspUtils";
import { createOdspUrl } from "../createOdspUrl";
import { getHashedDocumentId, ISnapshotContents } from "../odspPublicUtils";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager";
import { prefetchLatestSnapshot } from "../prefetchLatestSnapshot";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache();

describe("Tests for prefetching snapshot", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	const filePath = "path";
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	let service: OdspDocumentStorageService;
	let resolved: IOdspResolvedUrl;
	let mockLogger: MockLogger;
	let snapshotPrefetchCacheKey: string;

	const newFileParams: INewFileInfo = {
		type: "New",
		driveId,
		siteUrl,
		filePath,
		filename: "filename",
	};

	function GetHostStoragePolicyInternal(
		isSummarizer: boolean = false,
	): HostStoragePolicyInternal {
		return {
			snapshotOptions: { timeout: 2000 },
			summarizerClient: isSummarizer,
			fetchBinarySnapshotFormat: false,
			// for testing both network and cache fetch
			concurrentSnapshotFetch: true,
			avoidPrefetchSnapshotCache: false,
		};
	}
	const resolver = new OdspDriverUrlResolver();
	let snapshotPrefetchResultCache: PromiseCache<string, IPrefetchSnapshotContents>;
	const odspUrl = createOdspUrl({ ...newFileParams, itemId, dataStorePath: "/" });

	const odspSnapshot: IOdspSnapshot = {
		id: "id",
		trees: [
			{
				entries: [{ path: "path", type: "tree" }],
				id: "id",
				sequenceNumber: 1,
			},
		],
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

	const expectedVersion = [{ id: "id", treeId: undefined! }];

	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	describe("Tests for prefetching snapshot: Concurrent snapshot fetch", () => {
		let odspDocumentServiceFactory: OdspDocumentServiceFactory;
		beforeEach(async () => {
			mockLogger = new MockLogger();
			localCache = createUtLocalCache();
			resolved = await resolver.resolve({ url: odspUrl });
			odspDocumentServiceFactory = new OdspDocumentServiceFactory(
				async (_options) => "token",
				async (_options) => "token",
				localCache,
				GetHostStoragePolicyInternal(),
			);
			snapshotPrefetchCacheKey = getKeyForCacheEntry(createCacheSnapshotKey(resolved));
			const documentservice = await odspDocumentServiceFactory.createDocumentService(
				resolved,
				mockLogger,
			);
			service = (await documentservice.connectToStorage()) as OdspDocumentStorageService;
			snapshotPrefetchResultCache = odspDocumentServiceFactory.snapshotPrefetchResultCache;
		});

		afterEach(async () => {
			localCache
				.removeEntries({ docId: hashedDocumentId, resolvedUrl: resolved })
				.catch(() => {});
			snapshotPrefetchResultCache.remove(snapshotPrefetchCacheKey);
		});

		it("prefetching snapshot should result in snapshot source as cache as prefetch adds to cache", async () => {
			await mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			const version = await service.getVersions(null, 1);

			assert.deepStrictEqual(version, expectedVersion, "incorrect version");
			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			assert(
				mockLogger.matchEvents([
					{ eventName: "OdspDriver:ObtainSnapshot_end", method: "cache" },
				]),
				"Source should be cache",
			);
		});

		it("prefetching snapshot should result in snapshot source as network if both cache and prefetch throws", async () => {
			// overwriting get() to make cache fetch throw
			localCache.get = async () => {
				throw new Error("testing");
			};

			await mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				notFound,
			);

			const version = await mockFetchSingle(
				async () => service.getVersions(null, 1),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);
			assert.deepStrictEqual(version, expectedVersion, "incorrect version");
			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			assert(
				mockLogger.matchEvents([
					{ eventName: "OdspDriver:ObtainSnapshot_end", method: "network" },
				]),
				"Source should be network",
			);
		});

		it("prefetching snapshot should result in snapshot source as cache or network if prefetch throws and cache contains the response", async () => {
			const cacheEntry: ICacheEntry = {
				key: "",
				type: "snapshot",
				file: { docId: resolved.hashedDocumentId, resolvedUrl: resolved },
			};
			await localCache.put(cacheEntry, value);

			await mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				notFound,
			);

			const version = await mockFetchSingle(
				async () => service.getVersions(null, 1),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			assert.deepStrictEqual(version, expectedVersion, "incorrect version");
			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			const method = mockLogger.events.filter((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)[0].method as string;
			assert(method === "cache" || method === "network", "Source should be cache or network");
		});

		it("prefetching snapshot should result in snapshot source as either cache or prefetch if both pass", async () => {
			const cacheEntry: ICacheEntry = {
				key: "",
				type: "snapshot",
				file: { docId: hashedDocumentId, resolvedUrl: resolved },
			};
			await localCache.put(cacheEntry, value);

			mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			const version = await service.getVersions(null, 1);
			assert.deepStrictEqual(version, expectedVersion, "incorrect version");
			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			const method = mockLogger.events.filter((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)[0].method as string;
			assert(
				method === "cache" || method === "prefetched",
				"Source should be cache or prefetched",
			);
		});

		it("prefetching snapshot should result in epoch error if different from what is already present", async () => {
			// overwriting get() to make cache fetch throw
			localCache.get = async () => {
				throw new Error("testing");
			};
			// Set epoch first
			await mockFetchSingle(
				async () => service.readBlob("id"),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						JSON.stringify("odspSnapshot"),
						200,
					),
			);

			mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			let errorOccurred = false;
			const version = await service.getVersions(null, 1).catch((err) => {
				errorOccurred = true;
				return undefined;
			});

			assert.deepStrictEqual(version, undefined, "incorrect version");
			assert.deepStrictEqual(errorOccurred, true, "error didn't occur");
			assert(
				mockLogger.events.filter((event) =>
					event.eventName.includes("PrefetchSnapshotError"),
				).length === 1,
				"Snapshot prefetch has different epoch",
			);
		});

		it("prefetching snapshot should result in epoch error if different from what is already present, fetch is not from cache", async () => {
			// Set epoch first
			await mockFetchSingle(
				async () => service.readBlob("id"),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						JSON.stringify("odspSnapshot"),
						200,
					),
			);
			mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			let errorOccurred = false;
			const version = await service
				.getVersions(null, 1, undefined, FetchSource.noCache)
				.catch((err) => {
					errorOccurred = true;
					return undefined;
				});

			assert.deepStrictEqual(version, undefined, "incorrect version");
			assert.deepStrictEqual(errorOccurred, true, "error didn't occur");
			assert(
				mockLogger.events.filter((event) =>
					event.eventName.includes("PrefetchSnapshotError"),
				).length === 1,
				"Snapshot prefetch has different epoch",
			);
		});
	});

	describe("Tests for prefetching snapshot: No Concurrent snapshot fetch", () => {
		let odspDocumentServiceFactory: OdspDocumentServiceFactory;
		beforeEach(async () => {
			mockLogger = new MockLogger();
			localCache = createUtLocalCache();
			resolved = await resolver.resolve({ url: odspUrl });
			const hostPolicy = GetHostStoragePolicyInternal();
			hostPolicy.concurrentSnapshotFetch = false;
			odspDocumentServiceFactory = new OdspDocumentServiceFactory(
				async (_options) => "token",
				async (_options) => "token",
				localCache,
				hostPolicy,
			);
			snapshotPrefetchCacheKey = getKeyForCacheEntry(createCacheSnapshotKey(resolved));
			const documentservice = await odspDocumentServiceFactory.createDocumentService(
				resolved,
				mockLogger,
			);
			service = (await documentservice.connectToStorage()) as OdspDocumentStorageService;
			snapshotPrefetchResultCache = odspDocumentServiceFactory.snapshotPrefetchResultCache;
		});

		afterEach(async () => {
			localCache
				.removeEntries({ docId: hashedDocumentId, resolvedUrl: resolved })
				.catch(() => {});
			snapshotPrefetchResultCache.remove(snapshotPrefetchCacheKey);
		});

		it("prefetching snapshot should result in epoch error if different from what is already present, no concurrent fetch", async () => {
			// Set epoch first
			await mockFetchSingle(
				async () => service.readBlob("id"),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						JSON.stringify("odspSnapshot"),
						200,
					),
			);
			mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			let errorOccurred = false;
			const version = await service.getVersions(null, 1, undefined).catch((err) => {
				errorOccurred = true;
				return undefined;
			});

			assert.deepStrictEqual(version, undefined, "incorrect version");
			assert.deepStrictEqual(errorOccurred, true, "error didn't occur");

			assert(
				mockLogger.events.filter((event) =>
					event.eventName.includes("PrefetchSnapshotError"),
				).length === 1,
				"Snapshot prefetch has different epoch",
			);
		});

		it("prefetching snapshot should be successful from prefetching, no concurrent fetch", async () => {
			await mockFetchSingle(
				async () =>
					prefetchLatestSnapshot(
						resolved,
						async (_options) => "token",
						localCache,
						true,
						mockLogger,
						undefined,
						false,
						undefined,
						undefined,
						odspDocumentServiceFactory,
					),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			const version = await service.getVersions(null, 1);

			assert.deepStrictEqual(version, expectedVersion, "incorrect version");
			// Should be from cache as prefetch will store in cache
			assert(
				mockLogger.matchEvents([
					{ eventName: "OdspDriver:ObtainSnapshot_end", method: "cache" },
				]),
				"unexpected events",
			);
		});
	});
});
