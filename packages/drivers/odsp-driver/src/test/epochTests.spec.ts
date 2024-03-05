/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IDocumentStorageServicePolicies } from "@fluidframework/driver-definitions";
import {
	OdspErrorTypes,
	IOdspResolvedUrl,
	ICacheEntry,
	IEntry,
} from "@fluidframework/odsp-driver-definitions";
import { IFluidErrorBase, createChildLogger } from "@fluidframework/telemetry-utils";
import { defaultCacheExpiryTimeoutMs, EpochTracker } from "../epochTracker.js";
import { LocalPersistentCache } from "../odspCache.js";
import { getHashedDocumentId } from "../odspPublicUtils.js";
import { IVersionedValueWithEpoch, persistedCacheValueVersion } from "../contracts.js";
import { mockFetchOk, mockFetchSingle, createResponse } from "./mockFetch.js";

const createUtLocalCache = (): LocalPersistentCache => new LocalPersistentCache();

describe("Tests for Epoch Tracker", () => {
	const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
	const driveId = "driveId";
	const itemId = "itemId";
	let epochTracker: EpochTracker;
	let localCache: LocalPersistentCache;
	let hashedDocumentId: string;
	const resolvedUrl = {
		siteUrl,
		driveId,
		itemId,
		odspResolvedUrl: true,
	} as unknown as IOdspResolvedUrl;

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
			createChildLogger(),
		);
	});

	afterEach(async () => {
		await epochTracker.removeEntries().catch(() => {});
	});

	it("defaultCacheExpiryTimeoutMs <= maximumCacheDurationMs policy", () => {
		// This is the maximum allowed value per the policy - 5 days
		const maximumCacheDurationMs: Exclude<
			IDocumentStorageServicePolicies["maximumCacheDurationMs"],
			undefined
		> = 432000000;

		assert(
			defaultCacheExpiryTimeoutMs <= maximumCacheDurationMs,
			"Actual cache expiry used must meet the policy",
		);
	});

	it("Cache, old versions", async () => {
		const cacheEntry1: ICacheEntry = {
			key: "key1",
			type: "snapshot",
			file: { docId: hashedDocumentId, resolvedUrl },
		};
		const cacheEntry2: ICacheEntry = { ...cacheEntry1, key: "key2" };
		const cacheValue1 = { val: "val1", cacheEntryTime: Date.now() };
		const cacheValue2 = { val: "val2", cacheEntryTime: Date.now() };
		const value1: IVersionedValueWithEpoch = {
			value: cacheValue1,
			fluidEpoch: "epoch1",
			version: persistedCacheValueVersion,
		};
		const value2 = {
			value: cacheValue2,
			fluidEpoch: "epoch1",
			version: "non-existing version",
		};
		await localCache.put(cacheEntry1, value1);
		await localCache.put(cacheEntry2, value2);
		// This will set the initial epoch value in epoch tracker.
		assert(
			(await epochTracker.get(cacheEntry1)) === cacheValue1,
			"Entry 1 should continue to exist",
		);
		// This should not fail, just return nothing!
		await epochTracker.get(cacheEntry2);
		// Make sure nothing changed as result of reading data.
		assert(
			(await epochTracker.get(cacheEntry1)) === cacheValue1,
			"Entry 1 should continue to exist",
		);
		assert((await epochTracker.get(cacheEntry2)) === undefined, "Entry 2 should not exist");
	});

	it("Epoch error when fetch error from cache should throw epoch error and clear cache", async () => {
		const cacheEntry1: ICacheEntry = {
			key: "key1",
			type: "snapshot",
			file: { docId: hashedDocumentId, resolvedUrl },
		};
		const cacheEntry2: ICacheEntry = { ...cacheEntry1, key: "key2" };
		const cacheValue1 = { val: "val1", cacheEntryTime: Date.now() };
		const cacheValue2 = { val: "val2", cacheEntryTime: Date.now() };
		const value1: IVersionedValueWithEpoch = {
			value: cacheValue1,
			fluidEpoch: "epoch1",
			version: persistedCacheValueVersion,
		};
		const value2: IVersionedValueWithEpoch = {
			value: cacheValue2,
			fluidEpoch: "epoch2",
			version: persistedCacheValueVersion,
		};
		await localCache.put(cacheEntry1, value1);
		await localCache.put(cacheEntry2, value2);
		// This will set the initial epoch value in epoch tracker.
		assert(
			(await epochTracker.get(cacheEntry1)) === cacheValue1,
			"Entry 1 should continue to exist",
		);
		// This should not fail, just return nothing!
		await epochTracker.get(cacheEntry2);
		// Make sure nothing changed as result of reading data.
		assert(
			(await epochTracker.get(cacheEntry1)) === cacheValue1,
			"Entry 1 should continue to exist",
		);
		assert((await epochTracker.get(cacheEntry2)) === undefined, "Entry 2 should not exist");
	});

	it("Epoch error when fetch response and should clear cache", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchOk(
				async () => epochTracker.fetchArray("fetchUrl", {}, "test"),
				{},
				{ "x-fluid-epoch": "epoch2" },
			);
		} catch (error: unknown) {
			success = false;
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.fileOverwrittenInStorage,
				"Error should be epoch error",
			);
		}
		assert(
			(await epochTracker.get(cacheEntry1)) === undefined,
			"Entry in cache should be cleared",
		);
		assert.strictEqual(success, false, "Fetching should fail!!");
	});

	it("Epoch error when fetch response as json and should clear cache", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchOk(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				{},
				{ "x-fluid-epoch": "epoch2" },
			);
		} catch (error: unknown) {
			success = false;
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.fileOverwrittenInStorage,
				"Error should be epoch error",
			);
		}
		assert(
			(await epochTracker.get(cacheEntry1)) === undefined,
			"Entry in cache should be cleared",
		);
		assert.strictEqual(success, false, "Fetching should fail!!");
	});

	it("Check client correlationID on error in unsuccessful fetch case", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchOk(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				{},
				{ "x-fluid-epoch": "epoch2" },
			);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			success = false;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
			assert(error.XRequestStatsHeader !== undefined, "CorrelationId should be present");
		}
		assert.strictEqual(success, false, "Fetching should fail!!");
	});

	it("Check client correlationID on spoCommonHeaders in successful fetch case", async () => {
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		const response = await mockFetchOk(
			async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
			{},
			{ "x-fluid-epoch": "epoch1" },
		);
		assert(
			response.propsToLog.XRequestStatsHeader !== undefined,
			"CorrelationId should be present",
		);
	});

	it("Epoch error should not occur if response does not contain epoch", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchOk(async () => epochTracker.fetchArray("fetchUrl", {}, "test"));
		} catch {
			success = false;
		}
		assert.strictEqual(success, true, "Fetching should succeed!!");
		assert.strictEqual(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member
			(await epochTracker.get(cacheEntry1)).val,
			"val1",
			"Entry in cache should be present",
		);
	});

	it("Epoch error should not occur if response contains same epoch", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchOk(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				{},
				{ "x-fluid-epoch": "epoch1" },
			);
		} catch {
			success = false;
		}
		assert.strictEqual(success, true, "Fetching should succeed!!");
		assert.strictEqual(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member
			(await epochTracker.get(cacheEntry1)).val,
			"val1",
			"Entry in cache should be present",
		);
	});

	it("Should differentiate between epoch and coherency 409 errors when coherency 409", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchSingle(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				async () => createResponse({ "x-fluid-epoch": "epoch1" }, undefined, 409),
			);
		} catch (error: unknown) {
			success = false;
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.throttlingError,
				"Error should be throttling error",
			);
		}
		assert.strictEqual(success, false, "Fetching should not succeed!!");
		assert.strictEqual(
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, unicorn/no-await-expression-member
			(await epochTracker.get(cacheEntry1)).val,
			"val1",
			"Entry in cache should be present because it was not epoch 409",
		);
	});

	it("Should differentiate between epoch and coherency 409 errors when epoch 409", async () => {
		let success: boolean = true;
		const cacheEntry1: IEntry = {
			key: "key1",
			type: "snapshot",
		};
		epochTracker.setEpoch("epoch1", true, "test");
		await epochTracker.put(cacheEntry1, { val: "val1" });
		// This will set the initial epoch value in epoch tracker.
		await epochTracker.get(cacheEntry1);
		try {
			await mockFetchSingle(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				async () => createResponse({ "x-fluid-epoch": "epoch2" }, undefined, 409),
			);
		} catch (error: unknown) {
			success = false;
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.fileOverwrittenInStorage,
				"Error should be epoch error",
			);
		}
		assert.strictEqual(success, false, "Fetching should not succeed!!");
		assert(
			(await epochTracker.get(cacheEntry1)) === undefined,
			"Entry in cache should be absent because it was epoch 409",
		);
	});

	it("Check for resolved url on LocationRedirection error", async () => {
		let success: boolean = true;
		const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";
		try {
			await mockFetchSingle(
				async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
				async () =>
					createResponse(
						{ "x-fluid-epoch": "epoch1" },
						{
							error: {
								"message": "locationMoved",
								"@error.redirectLocation": newSiteUrl,
							},
						},
						404,
					),
			);
		} catch (error: unknown) {
			success = false;
			assert.strictEqual(
				(error as Partial<IFluidErrorBase>).errorType,
				OdspErrorTypes.locationRedirection,
				"Error should be locationRedirection error",
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			const newResolvedUrl: IOdspResolvedUrl = (error as any).redirectUrl;
			assert.strictEqual(newResolvedUrl.siteUrl, newSiteUrl, "New site url should match");
			assert.strictEqual(newResolvedUrl.driveId, driveId, "driveId should remain same");
		}
		assert.strictEqual(success, false, "Fetching should not succeed!!");
	});
});
