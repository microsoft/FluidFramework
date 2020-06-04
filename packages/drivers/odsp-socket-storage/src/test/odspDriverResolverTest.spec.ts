/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { CreateNewHeader } from "@fluidframework/driver-definitions";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";

describe("Odsp Driver Resolver", () => {
    it("Create New Request", async () => {
        // Arrange
        const siteUrl = "www.localhost.xxx";
        const driveId = "driveId";
        const filePath = "path";
        const fileName = "fileName";
        const resolver = new OdspDriverUrlResolver();

        // Act
        const request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Assert
        assert.equal(request.headers?.[CreateNewHeader.createNew].fileName, fileName,
            "Request should contain fileName");
        const url = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
        assert.equal(request.url, url, "Request url should match");
    });

    it("Resolved CreateNew Request", async () => {
        // Arrange
        const siteUrl = "www.localhost.xxx";
        const driveId = "driveId";
        const filePath = "path";
        const fileName = "fileName";
        const resolver = new OdspDriverUrlResolver();
        const request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.equal(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.equal(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.equal(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.equal(resolvedUrl.itemId, "", "Item id should be absent");
        assert.equal(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.equal(resolvedUrl.createNewOptions, undefined, "Create new options should be undefined");
        assert.equal(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("path"), filePath, "filePath should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Test RequestUrl for a component", async () => {
        // Arrange
        const siteUrl = "www.localhost.xxx";
        const driveId = "driveId";
        const filePath = "path";
        const fileName = "fileName";
        const resolver = new OdspDriverUrlResolver();
        const request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/component");

        // Assert
        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.equal(searchParams.get("path"), "/", "Path should match");
        assert.equal(url, `${siteUrl}/component`, "Url should match");
    });

    it("Empty string filePath is resolvable", async () => {
        // Arrange
        const siteUrl = "www.localhost.xxx";
        const driveId = "driveId";
        const filePath = "";
        const fileName = "fileName";
        const resolver = new OdspDriverUrlResolver();
        const request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.equal(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.equal(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.equal(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.equal(resolvedUrl.itemId, "", "Item id should be absent");
        assert.equal(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.equal(resolvedUrl.createNewOptions, undefined, "Create new options should be undefined");
        assert.equal(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("path"), filePath, "filePath should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive id should match");
    });
});
