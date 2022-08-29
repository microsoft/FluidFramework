/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    IOdspResolvedUrl,
    ICacheEntry,
    IEntry,
} from "@fluidframework/odsp-driver-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache } from "../odspCache";
import { getHashedDocumentId } from "../odspPublicUtils";
import { IVersionedValueWithEpoch, persistedCacheValueVersion } from "../contracts";
import { mockFetchOk, mockFetchSingle, createResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache();

describe("Tests for Epoch Tracker", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    let epochTracker: EpochTracker;
    let localCache: LocalPersistentCache;
    let hashedDocumentId: string;
    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;

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

    afterEach(async () => {
        await epochTracker.removeEntries().catch(() => {});
    });

    it("Cache, old versions", async () => {
        const cacheEntry1: ICacheEntry = {
            key: "key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        const cacheEntry2: ICacheEntry = { ... cacheEntry1, key: "key2" };
        const cacheValue1 = { val: "val1", cacheEntryTime: Date.now() };
        const cacheValue2 = { val: "val2", cacheEntryTime: Date.now() };
        const value1: IVersionedValueWithEpoch =
            { value: cacheValue1, fluidEpoch: "epoch1", version: persistedCacheValueVersion };
        const value2 =
            { value: cacheValue2, fluidEpoch: "epoch1", version: "non-existing version" };
        await localCache.put(cacheEntry1, value1);
        await localCache.put(cacheEntry2, value2);
        // This will set the initial epoch value in epoch tracker.
        assert(await epochTracker.get(cacheEntry1) === cacheValue1, "Entry 1 should continue to exist");
        // This should not fail, just return nothing!
        await epochTracker.get(cacheEntry2);
        // Make sure nothing changed as result of reading data.
        assert(await epochTracker.get(cacheEntry1) === cacheValue1, "Entry 1 should continue to exist");
        assert(await epochTracker.get(cacheEntry2) === undefined, "Entry 2 should not exist");
    });

    it("Epoch error when fetch error from cache should throw epoch error and clear cache", async () => {
        const cacheEntry1: ICacheEntry = {
            key: "key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        const cacheEntry2: ICacheEntry = { ... cacheEntry1, key: "key2" };
        const cacheValue1 = { val: "val1", cacheEntryTime: Date.now() };
        const cacheValue2 = { val: "val2", cacheEntryTime: Date.now() };
        const value1: IVersionedValueWithEpoch =
            { value: cacheValue1, fluidEpoch: "epoch1", version: persistedCacheValueVersion };
        const value2: IVersionedValueWithEpoch =
            { value: cacheValue2, fluidEpoch: "epoch2", version: persistedCacheValueVersion };
        await localCache.put(cacheEntry1, value1);
        await localCache.put(cacheEntry2, value2);
        // This will set the initial epoch value in epoch tracker.
        assert(await epochTracker.get(cacheEntry1) === cacheValue1, "Entry 1 should continue to exist");
        // This should not fail, just return nothing!
        await epochTracker.get(cacheEntry2);
        // Make sure nothing changed as result of reading data.
        assert(await epochTracker.get(cacheEntry1) === cacheValue1, "Entry 1 should continue to exist");
        assert(await epochTracker.get(cacheEntry2) === undefined, "Entry 2 should not exist");
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
                { "x-fluid-epoch": "epoch2" });
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage,
                "Error should be epoch error");
        }
        assert(await epochTracker.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
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
                { "x-fluid-epoch": "epoch2" });
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage,
                "Error should be epoch error");
        }
        assert(await epochTracker.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
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
                { "x-fluid-epoch": "epoch2" });
        } catch (error: any) {
            success = false;
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
                { "x-fluid-epoch": "epoch1" });
        assert(response.propsToLog.XRequestStatsHeader !== undefined, "CorrelationId should be present");
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
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual(
            (await epochTracker.get(cacheEntry1)).val,
            "val1",
            "Entry in cache should be present");
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
                { "x-fluid-epoch": "epoch1" });
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual(
            (await epochTracker.get(cacheEntry1)).val,
            "val1", "Entry in cache should be present");
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
                async () => createResponse({ "x-fluid-epoch": "epoch1" }, undefined, 409));
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError, "Error should be throttling error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert.strictEqual(
            (await epochTracker.get(cacheEntry1)).val,
            "val1",
            "Entry in cache should be present because it was not epoch 409");
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
                async () => createResponse({ "x-fluid-epoch": "epoch2" }, undefined, 409));
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage,
                "Error should be epoch error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert(
            await epochTracker.get(cacheEntry1) === undefined,
            "Entry in cache should be absent because it was epoch 409");
    });

    it("Check for resolved url on LocationRedirection error", async () => {
        let success: boolean = true;
        const newSiteUrl = "https://microsoft.sharepoint.com/siteUrl";
        try {
            await mockFetchSingle(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
                async () => createResponse(
                    { "x-fluid-epoch": "epoch1" },
                    { error: { "message": "locationMoved", "@error.redirectLocation": newSiteUrl } },
                    404,
                ));
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.locationRedirection,
                "Error should be locationRedirection error");
            const newResolvedUrl: IOdspResolvedUrl = error.redirectUrl;
            assert.strictEqual(newResolvedUrl.siteUrl, newSiteUrl, "New site url should match");
            assert.strictEqual(newResolvedUrl.driveId, driveId, "driveId should remain same");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
    });
});
