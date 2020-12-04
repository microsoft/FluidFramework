/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { OdspErrorType } from "@fluidframework/odsp-doclib-utils";
import { IOdspResolvedUrl } from "../contracts";
import { EpochTracker, FetchType } from "../epochTracker";
import { ICacheEntry, LocalPersistentCache, LocalPersistentCacheAdapter } from "../odspCache";
import { getHashedDocumentId } from "../odspUtils";
import { mockFetch } from "./mockFetch";

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

    it.skip("Epoch error when fetch error from cache should throw epoch error and clear cache", async () => {
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
            return epochTracker.fetchFromCache(cacheEntry1, undefined, FetchType.other);
        });
        try {
            await mockFetch({}, async () => {
                return epochTracker.fetchFromCache(cacheEntry2, undefined, FetchType.other);
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert(await cache.get(cacheEntry1) === undefined, "Entry 1 should not exist");
        assert(await cache.get(cacheEntry2) === undefined, "Entry 2 should not exist");
        assert.strictEqual(success, false, "Fetching fro cache should fail!!");
    });

    it.skip("Epoch error when fetch response and should clear cache", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, FetchType.other);
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch2" } }, async () => {
                return epochTracker.fetchResponse("fetchUrl", {}, FetchType.other);
            });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, OdspErrorType.epochVersionMismatch, "Error should be epoch error");
        }
        assert(await cache.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
        assert.strictEqual(success, false, "Fetching should fail!!");
    });

    it.skip("Epoch error when fetch response as json and should clear cache", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);
        // This will set the initial epoch value in epoch tracker.
        await mockFetch({}, async () => {
            return epochTracker.fetchFromCache(cacheEntry1, undefined, FetchType.other);
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch2" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, FetchType.other);
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
            return epochTracker.fetchFromCache(cacheEntry1, undefined, FetchType.other);
        });
        try {
            await mockFetch({}, async () => {
                return epochTracker.fetchResponse("fetchUrl", {}, FetchType.other);
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
            return epochTracker.fetchFromCache(cacheEntry1, undefined, FetchType.other);
        });
        try {
            await mockFetch({ headers: { "x-fluid-epoch": "epoch1" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, FetchType.other);
            });
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual((await cache.get(cacheEntry1)).value, "val1", "Entry in cache should be present");
    });
});
