/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { ISnapshot } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl, ICacheEntry } from "@fluidframework/odsp-driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { delay } from "@fluidframework/core-utils";
import { EpochTracker, defaultCacheExpiryTimeoutMs } from "../epochTracker.js";
import {
	IOdspSnapshot,
	HostStoragePolicyInternal,
	IVersionedValueWithEpoch,
	persistedCacheValueVersion,
} from "../contracts.js";
import { LocalPersistentCache, NonPersistentCache } from "../odspCache.js";
import { INewFileInfo } from "../odspUtils.js";
import { createOdspUrl } from "../createOdspUrl.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver.js";
import {
	OdspDocumentStorageService,
	defaultSummarizerCacheExpiryTimeout,
} from "../odspDocumentStorageManager.js";
import { mockFetchSingle, notFound, createResponse } from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache();

describe("Tests for snapshot fetch", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	const filePath = "path";
	let epochTracker: EpochTracker;
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	let service: OdspDocumentStorageService;

	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

	const newFileParams: INewFileInfo = {
		type: "New",
		driveId,
		siteUrl: "https://www.localhost.xxx",
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
		};
	}
	const resolver = new OdspDriverUrlResolver();
	const nonPersistentCache = new NonPersistentCache();
	const logger = createChildLogger();
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
					deltaStorageUrl: "",
				},
				tokens: {},
				fileName: "",
				summarizer: false,
				id: "id",
			};

			epochTracker = new EpochTracker(
				localCache,
				{
					docId: hashedDocumentId,
					resolvedUrl,
				},
				createChildLogger(),
			);

			service = new OdspDocumentStorageService(
				resolvedUrlWithFileVersion,
				async (_options) => "token",
				logger,
				true,
				{ ...nonPersistentCache, persistedCache: epochTracker },
				GetHostStoragePolicyInternal(),
				epochTracker,
				async () => {
					return {};
				},
				() => "tenantid/id",
				undefined,
			);
		});

		afterEach(async () => {
			await epochTracker.removeEntries().catch(() => {});
		});

		it("should not fetch from cache with the same snapshot", async () => {
			const latestContent: ISnapshot = {
				snapshotTree: {
					id: "WrongId",
					blobs: {},
					trees: {},
				},
				blobContents: new Map(),
				ops: [],
				sequenceNumber: 0,
				latestSequenceNumber: 0,
				snapshotFormatV: 1,
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
		beforeEach(async () => {
			localCache = createUtLocalCache();
			// use null logger here as we expect errors
			epochTracker = new EpochTracker(
				localCache,
				{
					docId: hashedDocumentId,
					resolvedUrl,
				},
				createChildLogger(),
			);

			const resolved = await resolver.resolve({ url: odspUrl });
			service = new OdspDocumentStorageService(
				resolved,
				async (_options) => "token",
				logger,
				true,
				{ ...nonPersistentCache, persistedCache: epochTracker },
				GetHostStoragePolicyInternal(),
				epochTracker,
				async () => {
					return {};
				},
				() => "tenantid/id",
				undefined,
			);
		});

		afterEach(async () => {
			await epochTracker.removeEntries().catch(() => {});
		});

		it("cache fetch throws and network fetch succeeds", async () => {
			// overwriting get() to make cache fetch throw
			localCache.get = async (): Promise<void> => {
				throw new Error("testing");
			};

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
			localCache.get = async (): Promise<void> => {
				throw new Error("testing");
			};

			await assert.rejects(
				async () => {
					await mockFetchSingle(
						async () => service.getVersions(null, 1),
						// 404 response expected so network fetch throws
						notFound,
					);
				},
				/404/,
				"Expected 404 error to be thrown",
			);
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
			await assert.rejects(
				async () => {
					await mockFetchSingle(
						async () => service.getVersions(null, 1),
						// 404 response expected so network fetch throws
						notFound,
					);
				},
				/404/,
				"Expected 404 error to be thrown",
			);
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
				async () =>
					createResponse(
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

			await assert.rejects(
				async () => {
					await mockFetchSingle(
						async () => service.getVersions(null, 1),
						// 404 response expected so network fetch throws
						notFound,
					);
				},
				/404/,
				"Expected 404 error to be thrown",
			);
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
				createChildLogger(),
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
				async () => {
					return {};
				},
				() => "tenantid/id",
			);
		});

		afterEach(async () => {
			await epochTracker.removeEntries().catch(() => {});
		});

		it("cache expires and network fetch succeeds", async () => {
			const cacheEntry: ICacheEntry = {
				key: "",
				type: "snapshot",
				file: { docId: hashedDocumentId, resolvedUrl },
			};
			await localCache.put(
				cacheEntry,
				valueWithExpiredCache(defaultSummarizerCacheExpiryTimeout),
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
		});

		it("cache fetch succeeds", async () => {
			const cacheEntry: ICacheEntry = {
				key: "",
				type: "snapshot",
				file: { docId: hashedDocumentId, resolvedUrl },
			};
			await localCache.put(
				cacheEntry,
				valueWithExpiredCache(defaultSummarizerCacheExpiryTimeout - 5000),
			);

			assert.notEqual(cacheEntry, undefined, "Cache should have been restored");
		});
	});
});
