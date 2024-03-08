/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-floating-promises */
import { strict as assert } from "node:assert";
import { PromiseCache } from "@fluidframework/core-utils";
import {
	IOdspResolvedUrl,
	ICacheEntry,
	getKeyForCacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { FetchSource, ISnapshot } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { stringToBuffer } from "@fluid-internal/client-utils";
import {
	IOdspSnapshot,
	HostStoragePolicyInternal,
	IVersionedValueWithEpoch,
	persistedCacheValueVersion,
} from "../contracts.js";
import { IPrefetchSnapshotContents, LocalPersistentCache } from "../odspCache.js";
import { createCacheSnapshotKey, INewFileInfo } from "../odspUtils.js";
import { createOdspUrl } from "../createOdspUrl.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import { OdspDocumentStorageService } from "../odspDocumentStorageManager.js";
import { prefetchLatestSnapshot } from "../prefetchLatestSnapshot.js";
import { OdspDocumentServiceFactory } from "../odspDocumentServiceFactory.js";
import { convertToCompactSnapshot } from "../compactSnapshotWriter.js";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache();

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

	const content: ISnapshot = {
		snapshotTree: {
			id: "id",
			blobs: {},
			trees: {},
		},
		blobContents: new Map(),
		ops: [],
		sequenceNumber: 0,
		latestSequenceNumber: 0,
		snapshotFormatV: 1,
	};

	const snapshotTreeWithGroupId: ISnapshotTree = {
		id: "SnapshotId",
		blobs: {},
		trees: {
			".protocol": {
				blobs: {},
				trees: {},
			},
			".app": {
				blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
				trees: {
					".channels": {
						blobs: {},
						trees: {
							default: {
								blobs: {},
								trees: {
									dds: {
										blobs: {},
										trees: {},
									},
								},
								groupId: "G3",
							},
						},
						unreferenced: true,
						groupId: "G2",
					},
					".blobs": { blobs: {}, trees: {} },
				},
			},
		},
	};

	const blobContents = new Map<string, ArrayBuffer>([
		[
			"bARD4RKvW4LL1KmaUKp6hUMSp",
			stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 0 }), "utf8"),
		],
	]);

	const value: IVersionedValueWithEpoch = {
		value: { ...content, cacheEntryTime: Date.now() },
		fluidEpoch: "epoch1",
		version: persistedCacheValueVersion,
	};

	const expectedVersion = [{ id: "id", treeId: undefined! }];

	before(async () => {
		hashedDocumentId = await getHashedDocumentId(driveId, itemId);
	});

	describe("Tests for prefetching snapshot: Concurrent snapshot fetch: Using GetVersions Api", () => {
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
			localCache.get = async (): Promise<void> => {
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
			const method = mockLogger.events.find((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)?.method;
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
			const method = mockLogger.events.find((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)?.method;
			assert(
				method === "cache" || method === "prefetched",
				"Source should be cache or prefetched",
			);
		});

		it("prefetching snapshot should result in epoch error if different from what is already present", async () => {
			// overwriting get() to make cache fetch throw
			localCache.get = async (): Promise<void> => {
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

			// This will store the response with wrong epoch in the cache
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
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			await mockFetchSingle(
				async () => service.getVersions(null, 1),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			mockLogger.assertMatchAny(
				[
					{
						error: "Epoch mismatch",
						errorType: "fileOverwrittenInStorage",
						serverEpoch: "epoch2",
						clientEpoch: "epoch1",
						fetchType: "treesLatest",
					},
				],
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

			// This will store the response with wrong epoch in the cache
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
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			await mockFetchSingle(
				async () => service.getVersions(null, 1, FetchSource.noCache),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			mockLogger.assertMatchAny(
				[
					{
						error: "Epoch mismatch",
						errorType: "fileOverwrittenInStorage",
						serverEpoch: "epoch2",
						clientEpoch: "epoch1",
						fetchType: "treesLatest",
					},
				],
				"Snapshot prefetch has different epoch",
			);
		});
	});

	describe("Tests for prefetching snapshot: No Concurrent snapshot fetch: Using GetVersions Api", () => {
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

			// This will store the response with wrong epoch in the cache
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
						{ "x-fluid-epoch": "epoch2", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			await mockFetchSingle(
				async () => service.getVersions(null, 1, undefined),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/json" },
						odspSnapshot,
						200,
					),
			);

			mockLogger.assertMatchAny(
				[
					{
						error: "Epoch mismatch",
						errorType: "fileOverwrittenInStorage",
						serverEpoch: "epoch2",
						clientEpoch: "epoch1",
						fetchType: "treesLatest",
					},
				],
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

	describe("Tests for prefetching snapshot: Concurrent snapshot fetch: Using GetSnapshot Api", () => {
		let odspDocumentServiceFactory: OdspDocumentServiceFactory;
		const snapshotWithGroupId: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const valueWithGroupId: IVersionedValueWithEpoch = {
			value: { ...snapshotWithGroupId, cacheEntryTime: Date.now() },
			fluidEpoch: "epoch1",
			version: persistedCacheValueVersion,
		};
		const odspCompactSnapshotWithGroupId = convertToCompactSnapshot(snapshotWithGroupId);
		const snapshotTreeWithGroupIdToCompare: ISnapshotTree = {
			blobs: { ...snapshotTreeWithGroupId.trees[".app"].blobs },
			trees: {
				...snapshotTreeWithGroupId.trees[".app"].trees,
				".protocol": snapshotTreeWithGroupId.trees[".protocol"],
			},
		};
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
						{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
						odspCompactSnapshotWithGroupId,
						200,
					),
			);

			const fetchedSnapshot = await service.getSnapshot();
			assert.deepStrictEqual(
				fetchedSnapshot.snapshotTree,
				snapshotTreeWithGroupIdToCompare,
				"incorrect snapshot",
			);
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
			localCache.get = async (): Promise<void> => {
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

			const fetchedSnapshot = await mockFetchSingle(
				async () => service.getSnapshot(),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
						odspCompactSnapshotWithGroupId,
						200,
					),
			);
			assert.deepStrictEqual(
				fetchedSnapshot.snapshotTree,
				snapshotTreeWithGroupIdToCompare,
				"incorrect snapshot",
			);
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
			await localCache.put(cacheEntry, valueWithGroupId);

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

			const fetchedSnapshot = await mockFetchSingle(
				async () => service.getSnapshot(),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
						odspCompactSnapshotWithGroupId,
						200,
					),
			);

			assert.deepStrictEqual(
				fetchedSnapshot.snapshotTree,
				snapshotTreeWithGroupIdToCompare,
				"incorrect snapshot",
			);
			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			const method = mockLogger.events.find((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)?.method;
			assert(method === "cache" || method === "network", "Source should be cache or network");
		});

		it("prefetching snapshot should result in snapshot source as either cache or prefetch if both pass", async () => {
			const cacheEntry: ICacheEntry = {
				key: "",
				type: "snapshot",
				file: { docId: hashedDocumentId, resolvedUrl: resolved },
			};
			await localCache.put(cacheEntry, valueWithGroupId);

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
						{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
						odspCompactSnapshotWithGroupId,
						200,
					),
			);

			const fetchedSnapshot = await service.getSnapshot();
			assert.deepStrictEqual(
				fetchedSnapshot.snapshotTree,
				snapshotTreeWithGroupIdToCompare,
				"incorrect snapshot",
			);

			assert(
				mockLogger.events.filter((event) => event.eventName.includes("ObtainSnapshot_end"))
					.length === 1,
				"1 Obtain snapshot event should be there",
			);
			const method = mockLogger.events.find((event) =>
				event.eventName.includes("ObtainSnapshot_end"),
			)?.method;
			assert(
				method === "cache" || method === "prefetched",
				"Source should be cache or prefetched",
			);
		});
	});

	describe("Tests for prefetching snapshot: No Concurrent snapshot fetch: Using GetSnapshot Api", () => {
		let odspDocumentServiceFactory: OdspDocumentServiceFactory;
		const snapshotWithGroupId: ISnapshot = {
			blobContents,
			snapshotTree: snapshotTreeWithGroupId,
			ops: [],
			latestSequenceNumber: 0,
			sequenceNumber: 0,
			snapshotFormatV: 1,
		};
		const odspCompactSnapshotWithGroupId = convertToCompactSnapshot(snapshotWithGroupId);
		const snapshotTreeWithGroupIdToCompare: ISnapshotTree = {
			blobs: { ...snapshotTreeWithGroupId.trees[".app"].blobs },
			trees: {
				...snapshotTreeWithGroupId.trees[".app"].trees,
				".protocol": snapshotTreeWithGroupId.trees[".protocol"],
			},
		};
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
						{ "x-fluid-epoch": "epoch1", "content-type": "application/ms-fluid" },
						odspCompactSnapshotWithGroupId,
						200,
					),
			);

			const fetchedSnapshot = await service.getSnapshot();

			assert.deepStrictEqual(
				fetchedSnapshot.snapshotTree,
				snapshotTreeWithGroupIdToCompare,
				"incorrect snapshot",
			);
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
