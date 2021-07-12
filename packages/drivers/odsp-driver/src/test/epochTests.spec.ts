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
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache } from "../odspCache";
import { getHashedDocumentId } from "../odspPublicUtils";
import { IVersionedValueWithEpoch, persistedCacheValueVersion } from "../contracts";
import { createNewFluidFile } from "../createFile";
import { INewFileInfo, createCacheSnapshotKey } from "../odspUtils";
import { mockFetchOk, mockFetchSingle, createResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(2000);

describe("Tests for Epoch Tracker", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    let epochTracker: EpochTracker;
    let localCache: LocalPersistentCache;
    const hashedDocumentId = getHashedDocumentId(driveId, itemId);
    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;
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

    it("Cache, old versions", async () => {
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        const cacheEntry2: ICacheEntry = { ... cacheEntry1, key: "key2" };
        const value1: IVersionedValueWithEpoch =
            {value: "val1", fluidEpoch: "epoch1", version: persistedCacheValueVersion };
        const value2 =
            {value: "val2", fluidEpoch: "epoch1", version: "non-existing version" };
        await localCache.put(cacheEntry1, value1);
        await localCache.put(cacheEntry2, value2);
        // This will set the initial epoch value in epoch tracker.
        assert(await epochTracker.get(cacheEntry1) === "val1", "Entry 1 should continue to exist");
        // This should not fail, just return nothing!
        await epochTracker.get(cacheEntry2);
        // Make sure nothing changed as result of reading data.
        assert(await epochTracker.get(cacheEntry1) === "val1", "Entry 1 should continue to exist");
        assert(await epochTracker.get(cacheEntry2) === undefined, "Entry 2 should not exist");
    });

    it("Epoch error when fetch error from cache should throw epoch error and clear cache", async () => {
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        const cacheEntry2: ICacheEntry = { ... cacheEntry1, key: "key2" };
        const value1: IVersionedValueWithEpoch =
            {value: "val1", fluidEpoch: "epoch1", version: persistedCacheValueVersion };
        const value2: IVersionedValueWithEpoch =
            {value: "val2", fluidEpoch: "epoch2", version: persistedCacheValueVersion };
        await localCache.put(cacheEntry1, value1);
        await localCache.put(cacheEntry2, value2);
        // This will set the initial epoch value in epoch tracker.
        assert(await epochTracker.get(cacheEntry1) === "val1", "Entry 1 should continue to exist");
        // This should not fail, just return nothing!
        await epochTracker.get(cacheEntry2);
        // Make sure nothing changed as result of reading data.
        assert(await epochTracker.get(cacheEntry1) === "val1", "Entry 1 should continue to exist");
        assert(await epochTracker.get(cacheEntry2) === undefined, "Entry 2 should not exist");
    });

    it("Epoch error when fetch response and should clear cache", async () => {
        let success: boolean = true;
        const cacheEntry1: IEntry = {
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
        // This will set the initial epoch value in epoch tracker.
        await epochTracker.get(cacheEntry1);
        try {
            await mockFetchOk(
                async () => epochTracker.fetchArray("fetchUrl", {}, "test"),
                {},
                { "x-fluid-epoch": "epoch2" });
        } catch (error) {
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
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
            // This will set the initial epoch value in epoch tracker.
        await epochTracker.get(cacheEntry1);
        try {
            await mockFetchOk(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
                {},
                { "x-fluid-epoch": "epoch2" });
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage,
                "Error should be epoch error");
        }
        assert(await epochTracker.get(cacheEntry1) === undefined, "Entry in cache should be cleared");
        assert.strictEqual(success, false, "Fetching should fail!!");
    });

    it("Epoch error should not occur if response does not contain epoch", async () => {
        let success: boolean = true;
        const cacheEntry1: IEntry = {
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
        // This will set the initial epoch value in epoch tracker.
        await epochTracker.get(cacheEntry1);
        try {
            await mockFetchOk(async () => epochTracker.fetchArray("fetchUrl", {}, "test"));
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual(
            await epochTracker.get(cacheEntry1),
            "val1",
            "Entry in cache should be present");
    });

    it("Epoch error should not occur if response contains same epoch", async () => {
        let success: boolean = true;
        const cacheEntry1: IEntry = {
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
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
            await epochTracker.get(cacheEntry1),
            "val1", "Entry in cache should be present");
    });

    it("Should differentiate between epoch and coherency 409 errors when coherency 409", async () => {
        let success: boolean = true;
        const cacheEntry1: IEntry = {
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
        // This will set the initial epoch value in epoch tracker.
        await epochTracker.get(cacheEntry1);
        try {
            await mockFetchSingle(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
                async () => createResponse({ "x-fluid-epoch": "epoch1" }, undefined, 409));
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.throttlingError, "Error should be throttling error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert.strictEqual(
            await epochTracker.get(cacheEntry1),
            "val1",
            "Entry in cache should be present because it was not epoch 409");
    });

    it("Should differentiate between epoch and coherency 409 errors when epoch 409", async () => {
        let success: boolean = true;
        const cacheEntry1: IEntry = {
            key:"key1",
            type: "snapshot",
        };
        epochTracker.setEpoch("epoch1", true, "test");
        await epochTracker.put(cacheEntry1, "val1");
        // This will set the initial epoch value in epoch tracker.
        await epochTracker.get(cacheEntry1);
        try {
            await mockFetchSingle(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
                async () => createResponse({ "x-fluid-epoch": "epoch2" }, undefined, 409));
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileOverwrittenInStorage,
                "Error should be epoch error");
        }
        assert.strictEqual(success, false, "Fetching should not succeed!!");
        assert(
            await epochTracker.get(cacheEntry1) === undefined,
            "Entry in cache should be absent because it was epoch 409");
    });

    it("Should cache converted summary during createNewFluidFile", async () => {
        const createSummary = () => {
            const summary: ISummaryTree = {
                type: SummaryType.Tree,
                tree: {},
            };
                summary.tree[".app"] = {
                    type: SummaryType.Tree,
                    tree: {
                        attributes: {
                            type: SummaryType.Blob,
                            content: "testing",
                        },
                    },
                };
                summary.tree[".protocol"] = {
                    type: SummaryType.Tree,
                    tree: {
                        attributes: {
                            type: SummaryType.Blob,
                            content: JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber: 0,
                                term: 1 }),
                        },
                    },
                };
            return summary;
        };

        const filePath = "path";
        const newFileParams: INewFileInfo = {
            driveId,
            siteUrl: "https://www.localhost.xxx",
            filePath,
            filename: "filename",
        };

        const odspResolvedUrl = await mockFetchOk(
                async () =>createNewFluidFile(
                    async (_options) => "token",
                    newFileParams,
                    new TelemetryNullLogger(),
                    createSummary(),
                    epochTracker,
                ) ,
                { itemId: "itemId1"},
                { "x-fluid-epoch": "epoch1" },
                );
        const value = await epochTracker.get(createCacheSnapshotKey(odspResolvedUrl));
        const blobs = value.snapshot.blobs;
        assert.strictEqual(blobs.length, 2, "wrong length of blobs");
        assert.strictEqual(blobs[0].content, "testing", "wrong content of testing blob");

        const content = JSON.parse(blobs[1].content);
        assert.strictEqual(content.minimumSequenceNumber, 0, "wrong min sequence number");
        assert.strictEqual(content.sequenceNumber, 0, "wrong sequence number");
        assert.strictEqual(content.term, 1, "wrong term");
    });
});
