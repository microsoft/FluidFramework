/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "@fluidframework/common-utils";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import {
    IOdspResolvedUrl,
    IEntry,
    snapshotKey,
} from "@fluidframework/odsp-driver-definitions";
import { EpochTrackerWithRedemption } from "../epochTracker";
import { LocalPersistentCache } from "../odspCache";
import { getHashedDocumentId } from "../odspPublicUtils";
import { mockFetchSingle, mockFetchMultiple, okResponse, notFound } from "./mockFetch";

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
    const itemId = "itemId";
    let epochTracker: EpochTrackerWithRedemption;
    let hashedDocumentId: string;
    let epochCallback: DeferralWithCallback;

    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
    });

    beforeEach(() => {
        const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;
        epochTracker = new EpochTrackerWithRedemption(
            new LocalPersistentCache(),
            {
                docId: hashedDocumentId,
                resolvedUrl,
            },
            new TelemetryUTLogger());
        epochCallback = new DeferralWithCallback();
        (epochTracker as any).treesLatestDeferral = epochCallback;
    });

    afterEach(async () => {
        await epochTracker.removeEntries().catch(() => {});
    });

    it.skip("joinSession call should succeed on retrying after snapshot cached read succeeds", async () => {
        epochTracker.setEpoch("epoch1", true, "test");
        const cacheEntry1: IEntry = {
            type: snapshotKey,
            key: "key1",
        };
        await epochTracker.put(cacheEntry1, { val: "val1" });

        // We will trigger a successful call to return the value set in the cache after the failed joinSession call
        epochCallback.setCallback(async () => epochTracker.get(cacheEntry1));

        // Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
        await mockFetchMultiple(
            async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
            [notFound, async () => okResponse({ "x-fluid-epoch": "epoch1" }, {})],
        );
    });

    it("joinSession call should succeed on retrying after any network call to the file succeeds", async () => {
        epochTracker.setEpoch("epoch1", true, "test");
        const cacheEntry1: IEntry = {
            type: snapshotKey,
            key: "key1",
        };
        await epochTracker.put(cacheEntry1, { val: "val1" });

        // We will trigger a successful call to return the value set in the cache after the failed joinSession call
        epochCallback.setCallback(async () => {
            return epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest");
        });

        // Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
        await mockFetchMultiple(
            async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
            [
                notFound, // joinSession
                async () => okResponse({ "x-fluid-epoch": "epoch1" }, {}), // "treesLatest"
                async () => okResponse({ "x-fluid-epoch": "epoch1" }, {}), // "joinSession"
            ],
        );
    });

    it("Requests should fail if joinSession call fails and the getLatest call also fails", async () => {
        let success: boolean = true;

        try {
            epochCallback.setCallback(async () => {
                try {
                    await mockFetchSingle(
                        async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest"),
                        notFound,
                        "internal");
                } catch (error: any) {
                    assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                        "Error should be file not found or access denied error");
                }
            });
            await mockFetchSingle(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
                async () => notFound({ "x-fluid-epoch": "epoch1" }),
                "external");
        } catch (error: any) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                "Error should be file not found or access denied error");
        }
        assert.strictEqual(success, false, "Join session should fail if treesLatest call has failed");
    });
});
