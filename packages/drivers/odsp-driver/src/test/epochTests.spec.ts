/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { OdspErrorType } from "@fluidframework/odsp-doclib-utils";
import { IOdspResolvedUrl } from "../contracts";
import { EpochTracker } from "../epochTracker";
import { ICacheEntry, LocalPersistentCache, LocalPersistentCacheAdapter } from "../odspCache";
import { getHashedDocumentId } from "../odspUtils";
import { mockFetch, mockFetchCustom } from "./mockFetch";

describe("Tests for Epoch Tracker", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    let epochTracker: EpochTracker;
    let cache: LocalPersistentCacheAdapter;
    const hashedDocumentId = getHashedDocumentId(driveId, itemId);
    beforeEach(() => {
        cache = new LocalPersistentCacheAdapter(new LocalPersistentCache());
        epochTracker = new EpochTracker(cache, new TelemetryNullLogger());
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        epochTracker.fileEntry = {
            docId: hashedDocumentId,
            resolvedUrl,
        };
    });

    it("Epoch error when fetch error from cache should throw epoch error and clear cache", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        const cacheEntry2: ICacheEntry = { ... cacheEntry1, key: "key2" };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        cache.put(cacheEntry2, { value: "val2", fluidEpoch: "epoch2", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetch({}, async () => {
                return epochTracker.fetchFromCache(cacheEntry2, undefined, "other");
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert(await cache.get(cacheEntry1) === undefined, "Entry 1 should not exist");
        assert(await cache.get(cacheEntry2) === undefined, "Entry 2 should not exist");
        assert.strictEqual(success, false, "Fetching fro cache should fail!!");
    });

    it("Epoch error when fetch response and should clear cache", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch2" } }, async () => {
                return epochTracker.fetchResponse("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert(await cache.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
        assert.strictEqual(success, false, "Fetching should fail!!");
    });

    it("Epoch error when fetch response as json and should clear cache", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch2" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert(await cache.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
        assert.strictEqual(success, false, "Fetching should fail!!");
    });

    it("Epoch error should not occur if response does not contain epoch", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetch({}, async () => {
                return epochTracker.fetchResponse("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual((await cache.get(cacheEntry1)).value, "val1", "Entry in cache should be present");
    });

    it("Epoch error should not occur if response contains same epoch", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch1" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual((await cache.get(cacheEntry1)).value, "val1", "Entry in cache should be present");
    });

    it("Should differentiate between epoch and coherency 409 errors when coherency 409", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetchCustom({ headers: { "x-fluid-epoch": "epoch1" } }, false, 409, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError, "Error should be throttling error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert.strictEqual((await cache.get(cacheEntry1)).value, "val1",
            "Entry in cache should be present because it was not epoch 409");
    });

    it("Should differentiate between epoch and coherency 409 errors when epoch 409", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
        });
        try {
            await mockFetchCustom({ headers: { "x-fluid-epoch": "epoch2" } }, false, 409, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "other");
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert((await cache.get(cacheEntry1)) === undefined,
            "Entry in cache should be absent because it was epoch 409");
    });
});
