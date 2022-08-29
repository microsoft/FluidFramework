/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { getFileLink } from "../getFileLink";
import { mockFetchSingle, mockFetchMultiple, okResponse, notFound } from "./mockFetch";

describe("getFileLink", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const logger = new TelemetryUTLogger();
    const storageTokenFetcher = async () => "StorageToken";
    const fileItemResponse = {
        webDavUrl: "fetchDavUrl",
        webUrl: "fetchWebUrl",
    };

    it("should return share link with existing access", async () => {
        const result = await mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId4" }, logger),
            [
                async () => okResponse({}, fileItemResponse),
                async () => okResponse({}, { d: { directUrl: "sharelink" } }),
            ],
        );
        assert.strictEqual(
            result, "sharelink", "File link should match url returned from sharing information");
    });

    it("should reject if file web dav url is missing", async () => {
        await assert.rejects(mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId5" }, logger),
            [
                async () => okResponse({}, {}),
                // We retry once on malformed response from server, so need a second response mocked.
                async () => okResponse({}, {}),
            ],
        ), "File link should reject for malformed url");
    });

    it("should reject if file item is not found", async () => {
        await assert.rejects(mockFetchSingle(async () => {
            return getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId6" }, logger);
            },
            notFound,
        ), "File link should reject when not found");
    });
});
