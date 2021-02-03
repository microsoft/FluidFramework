/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger, Deferred } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "../contracts";
import { EpochTrackerWithRedemption } from "../epochTracker";
import { ICacheEntry, LocalPersistentCache, LocalPersistentCacheAdapter } from "../odspCache";
import { getHashedDocumentId } from "../odspUtils";
import { mockFetch, notFound, okResponse } from "./mockFetch";

class DeferralWithCallback extends Deferred<void> {
    private epochCallback: () => Promise<any> = async () => {};

    constructor() {
        super();
    }

    public setCallback(epochCallback) {
        this.epochCallback = epochCallback;
    }

    public get promise() {
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        return this.epochCallback().then(() => super.promise);
    }
}

describe("Tests for Epoch Tracker With Redemption", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    let epochTracker: EpochTrackerWithRedemption;
    let cache: LocalPersistentCacheAdapter;
    const hashedDocumentId = getHashedDocumentId(driveId, itemId);
    let epochCallback: DeferralWithCallback;

    beforeEach(() => {
        cache = new LocalPersistentCacheAdapter(new LocalPersistentCache());
        epochTracker = new EpochTrackerWithRedemption(cache, new TelemetryNullLogger());
        epochCallback = new DeferralWithCallback();
        (epochTracker as any).treesLatestDeferral = epochCallback;

        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        epochTracker.fileEntry = {
            docId: hashedDocumentId,
            resolvedUrl,
        };
    });

    it("joinSession call should succeed on retrying after any network call to the file succeeds", async () => {
        let success: boolean = true;
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
        const cacheEntry1: ICacheEntry = {
            key:"key1",
            type: "snapshot",
            file: { docId: hashedDocumentId, resolvedUrl } };
        cache.put(cacheEntry1, { value: "val1", fluidEpoch: "epoch1", version: "0.1" }, 0);

        try {
            // We will trigger a successful call to return the value set in the cache after the failed joinSession call
            epochCallback.setCallback(async () => mockFetch({}, async () => {
                return epochTracker.fetchFromCache(cacheEntry1, undefined, "other");
            }, okResponse, false, false));

            // Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
            await mockFetch({ headers: { "x-fluid-epoch": "epoch1" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession");
            }, notFound, true);
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Join session should succeed after retrying");
    });

    it("Requests should fail if joinSession call fails and the getLatest call also fails", async () => {
        let success: boolean = true;

        try {
            epochCallback.setCallback(async () => {
                try {
                    await mockFetch({}, async () => {
                        return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest");
                    }, notFound, false, false);
                } catch (error) {
                    assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                        "Error should be file not found or access denied error");
                }
            });
            await mockFetch({ headers: { "x-fluid-epoch": "epoch1" } }, async () => {
                return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession");
            }, notFound, true);
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                "Error should be file not found or access denied error");
        }
        assert.strictEqual(success, false, "Join session should fail if treesLatest call has failed");
    });
});
