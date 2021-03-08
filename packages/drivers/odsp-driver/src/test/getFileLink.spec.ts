/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { getFileLink } from "../getFileLink";
import { mockFetch, mockFetchMultiple, okResponse, notFound } from "./mockFetch";

describe("getFileLink", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const logger = new TelemetryNullLogger();
    const storageTokenFetcher = async () => "StorageToken";
    const fileItemResponse = {
        webDavUrl: "fetchDavUrl",
        webUrl: "fetchWebUrl",
    };

    it("should return web url for Consumer user", async () => {
        const result = await mockFetch(fileItemResponse, async () => {
            return getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId1", "Consumer", logger);
        });
        assert.strictEqual(result, fileItemResponse.webUrl, "File link for Consumer user should match webUrl");
    });

    it("should return undefined for Consumer user if file web url is missing", async () => {
        const result = await mockFetch({}, async () => {
            return getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId2", "Consumer", logger);
        });
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return undefined for Consumer user if file item is not found", async () => {
        const result = await mockFetch(notFound, async () => {
            return getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId3", "Consumer", logger);
        });
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return share link with existing access for Enterprise user", async () => {
        const result = await mockFetchMultiple(
            [okResponse({}, fileItemResponse), okResponse({}, { d: { directUrl: "sharelink" } })],
            async () => getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId4", "Enterprise", logger),
        );
        assert.strictEqual(
            result, "sharelink", "File link for Enterprise user should match url returned from sharing information");
    });

    it("should return undefined for Enterprise user if file web dav url is missing", async () => {
        const result = await mockFetch({}, async () => {
            return getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId5", "Enterprise", logger);
        });
        assert.strictEqual(result, undefined, "File link should be undefined");
    });

    it("should return undefined for Enterprise user if file item is not found", async () => {
        const result = await mockFetch(notFound, async () => {
            return getFileLink(storageTokenFetcher, siteUrl, driveId, "itemId6", "Enterprise", logger);
        });
        assert.strictEqual(result, undefined, "File link should be undefined");
    });
});
