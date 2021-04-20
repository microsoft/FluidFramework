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
            async () => getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId1"}, "Consumer", logger),
            fileItemResponse,
        );
        assert.strictEqual(result, fileItemResponse.webUrl, "File link for Consumer user should match webUrl");
    });

    it("should return undefined for Consumer user if file web url is missing", async () => {
        const result = await mockFetchOk(
            async () => getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId2"}, "Consumer", logger),
        );
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return undefined for Consumer user if file item is not found", async () => {
        const result = await mockFetchSingle(async () => {
                return getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId3"}, "Consumer", logger);
            },
            notFound,
        );
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return share link with existing access for Enterprise user", async () => {
        const result = await mockFetchMultiple(
            async () => getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId4"}, "Enterprise", logger),
            [
                async () => okResponse({}, fileItemResponse),
                async () => okResponse({}, { d: { directUrl: "sharelink" } }),
            ],
        );
        assert.strictEqual(
            result, "sharelink", "File link for Enterprise user should match url returned from sharing information");
    });

    it("should return undefined for Enterprise user if file web dav url is missing", async () => {
        const result = await mockFetchOk(
            async () => getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId5"}, "Enterprise", logger),
        );
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return undefined for Enterprise user if file item is not found", async () => {
        const result = await mockFetchSingle(async () => {
            return getFileLink(storageTokenFetcher, {siteUrl, driveId, itemId: "itemId6"}, "Enterprise", logger);
            },
            notFound);
        assert.strictEqual(result, undefined, "File link should be undefined");
    });
});
