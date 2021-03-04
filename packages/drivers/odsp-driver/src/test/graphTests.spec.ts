/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { getShareLink, GraphItemLite, IGraphFetchResponse } from "../graph";
import { mockFetch, mockFetchMultiple, okResponse } from "./mockFetch";

describe("Tests for Graph fetch", () => {
    const siteUrl = "https://microsoft.sharepoint-df.com/siteUrl";
    const driveId = "driveId";
    const itemId = "fileId";
    const logger = new TelemetryNullLogger();
    const graphOrigin = "graphOrigin";
    const shareLinkTokenFetcher = async () => "SharingLinkToken";

    beforeEach(() => {
    });

    it("Graph fetch should return share link correctly(no file default url)", async () => {
        const graphFetchResponse: IGraphFetchResponse = {
            link: {
                webUrl: "fetchShareLink",
            },
            name: "fetchName",
            webDavUrl: "fetchDavUrl",
            webUrl: "fetchWebUrl",
        };
        const result = await mockFetch({ name: graphFetchResponse.name, webDavUrl: graphFetchResponse.webDavUrl,
            webUrl: graphFetchResponse.webUrl, link: graphFetchResponse.link }, async () => {
            return getShareLink(shareLinkTokenFetcher, siteUrl, driveId, itemId,
                "Consumer", logger, "default", "edit", graphOrigin);
        });
        assert.strictEqual(result, graphFetchResponse.link.webUrl, "ShareLink should be successfully returned!!");
    });

    it("Graph fetch should return share link correctly(File default url)", async () => {
        const graphItemLite: GraphItemLite = {
            name: "fetchName",
            webDavUrl: "fetchDavUrl",
            webUrl: "fetchWebUrl",
        };
        const result = await mockFetch({ name: graphItemLite.name, webDavUrl: graphItemLite.webDavUrl,
            webUrl: graphItemLite.webUrl }, async () => {
            return getShareLink(shareLinkTokenFetcher, siteUrl, driveId, itemId,
                "Consumer", logger, "existingAccess", "edit", graphOrigin);
        });
        assert.strictEqual(result, graphItemLite.webUrl, "ShareLink should be successfully returned!!");
    });

    it("Graph fetch should fail to return share link correctly(File default url path)", async () => {
        // Changing itemId as it would have been cached otherwise from previous call.
        const result = await mockFetch({}, async () => {
            return getShareLink(shareLinkTokenFetcher, siteUrl, driveId, "newItemID",
                "Consumer", logger, "existingAccess", "edit", graphOrigin);
        });
        assert(result === undefined, "ShareLink should be absent!!");
    });

    it("Graph fetch should return share link correctly(File default url)(no graph item lite)", async () => {
        const graphItemLite: GraphItemLite = {
            name: "fetchName",
            webDavUrl: "fetchDavUrl",
            webUrl: "fetchWebUrl",
        };
        const result = await mockFetchMultiple(
            [
                okResponse({}, {
                     name: graphItemLite.name, webDavUrl: graphItemLite.webDavUrl, webUrl: graphItemLite.webUrl,
                }),
                okResponse({}, { d: { directUrl: "sharelink" } }),
            ], async () => {
            return getShareLink(shareLinkTokenFetcher, siteUrl, driveId, "newItemID1",
                "Enterprise", logger, "existingAccess", "edit", graphOrigin);
        });
        assert.strictEqual(result, "sharelink", "ShareLink should be successfully returned!!");
    });
});
