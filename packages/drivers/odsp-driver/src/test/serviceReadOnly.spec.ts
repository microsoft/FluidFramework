/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { EpochTracker } from "../epochTracker";
import { LocalPersistentCache } from "../odspCache";
import { getHashedDocumentId } from "../odspPublicUtils";
import { IOdspResponse } from "../odspUtils";
import { createResponse, mockFetchMultiple, okResponse } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(2000);

describe("ServiceReadOnlyError Tests", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "itemId";
    let epochTracker: EpochTracker;
    let localCache: LocalPersistentCache;
    let hashedDocumentId: string;
    const resolvedUrl = ({ siteUrl, driveId, itemId, odspResolvedUrl: true } as any) as IOdspResolvedUrl;
    let serviceReadOnlyError;

    before(async () => {
        hashedDocumentId = await getHashedDocumentId(driveId, itemId);
        serviceReadOnlyError = {
            error: {
                code: "accessDenied",
                innerError: {
                    code: "serviceReadOnly",
                },
                message: "Database Is Read Only",
            },
        };
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
        epochTracker.setEpoch("epoch1", true, "test");
    });

    it("Should successfully fetch when server throws serviceReadOnlyErrorCode", async () => {
        let success: boolean = true;
        let response: IOdspResponse<{ val: string }> | undefined;
        try {
            response = await mockFetchMultiple(
                async () => epochTracker.fetchAndParseAsJSON("fetchUrl", {}, "test"),
                [
                    async () => createResponse({ "x-fluid-epoch": "epoch1" },
                        serviceReadOnlyError, 403),
                    async () => okResponse({ "x-fluid-epoch": "epoch1" },  { val: "Success" }),
                ]);
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true, "Fetching should succeed!!");
        assert.strictEqual(response?.content?.val, "Success", "Error should be retried!!");
    });
});
