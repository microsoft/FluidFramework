/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Deferred } from "@fluidframework/common-utils";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "../contracts";
import {
    EpochTrackerWithRedemption,
} from "../epochTracker";
import {
    IEntry,
    LocalPersistentCache,
    snapshotKey,
} from "../odspCache";
import { getHashedDocumentId } from "../odspUtils";
import { mockFetchCore, mockFetchMultiple, okResponse, notFound } from "./mockFetch";

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
    const hashedDocumentId = getHashedDocumentId(driveId, itemId);
    let epochCallback: DeferralWithCallback;

    beforeEach(() => {
        const resolvedUrl = ({ siteUrl, driveId, itemId } as any) as IOdspResolvedUrl;
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

    it("joinSession call should succeed on retrying after any network call to the file succeeds", async () => {
        let success: boolean = true;
        epochTracker.setEpoch("epoch1", true, "test");
        const cacheEntry1: IEntry = {
            key:"key1",
            type: snapshotKey,
        };
        await epochTracker.put(cacheEntry1, "val1");

        try {
            // We will trigger a successful call to return the value set in the cache after the failed joinSession call
            epochCallback.setCallback(async () => epochTracker.get<string>(cacheEntry1));

            // Initial joinSession call will return 404 but after the timeout, the call will be retried and succeed
            await mockFetchMultiple(
                [notFound(), okResponse({ "x-fluid-epoch": "epoch1" }, {})],
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
            );
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
                    await mockFetchCore(
                        async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "treesLatest"),
                        notFound,
                        "internal");
                } catch (error) {
                    assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                        "Error should be file not found or access denied error");
                }
            });
            await mockFetchCore(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "joinSession"),
                async () => notFound({ "x-fluid-epoch": "epoch1" }),
                "external");
        } catch (error) {
            success = false;
            assert.strictEqual(error.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                "Error should be file not found or access denied error");
        }
        assert.strictEqual(success, false, "Join session should fail if treesLatest call has failed");
    });
});
