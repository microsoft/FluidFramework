/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { getFileLink } from "../getFileLink";
import { mockFetchOk, mockFetchSingle, mockFetchMultiple, okResponse, notFound } from "./mockFetch";

describe("getFileLink", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const logger = new TelemetryUTLogger();
    const storageTokenFetcher = async () => "StorageToken";
    const fileItemResponse = {
        webDavUrl: "fetchDavUrl",
        webUrl: "fetchWebUrl",
    };

    it("should return web url for Consumer user", async () => {
        const result = await mockFetchOk(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId1" }, "Consumer", logger),
            fileItemResponse,
        );
        assert.strictEqual(result, fileItemResponse.webUrl, "File link for Consumer user should match webUrl");
    });

    it("should reject for Consumer user if file web url is missing", async () => {
        await assert.rejects(mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId2" }, "Consumer", logger),
            [
                async () => okResponse({}, {}),
                // We retry once on malformed response from server, so need a second response mocked.
                async () => okResponse({}, {}),
            ],
        ), "Should reject for unexpected empty response");
    });

    it("should reject for Consumer user if file item is not found", async () => {
        await assert.rejects(mockFetchSingle(async () => {
                return getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId3" }, "Consumer", logger);
            },
            notFound,
        ), "File link should reject when not found");
    });

    it("should return share link with existing access for Enterprise user", async () => {
        const result = await mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId4" }, "Enterprise", logger),
            [
                async () => okResponse({}, fileItemResponse),
                async () => okResponse({}, { d: { directUrl: "sharelink" } }),
            ],
        );
        assert.strictEqual(
            result, "sharelink", "File link for Enterprise user should match url returned from sharing information");
    });

    it("should reject for Enterprise user if file web dav url is missing", async () => {
        await assert.rejects(mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId5" }, "Enterprise", logger),
            [
                async () => okResponse({}, {}),
                // We retry once on malformed response from server, so need a second response mocked.
                async () => okResponse({}, {}),
            ],
        ), "File link should reject for malformed url");
    });

    it("should reject for Enterprise user if file item is not found", async () => {
        await assert.rejects(mockFetchSingle(async () => {
            return getFileLink(storageTokenFetcher, { siteUrl, driveId, itemId: "itemId6" }, "Enterprise", logger);
            },
            notFound,
        ), "File link should reject when not found");
    });
});
