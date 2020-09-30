/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CreateNewHeader } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";

describe("Odsp Driver Resolver", () => {
    const siteUrl = "https://localhost";
    const driveId = "driveId";
    let filePath = "path";
    const fileName = "fileName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    });

    it("Create New Request", async () => {
        assert.strictEqual(request.headers?.[CreateNewHeader.createNew].fileName, fileName,
            "Request should contain fileName");
        const url = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
        assert.strictEqual(request.url, url, "Request url should match");
    });

    it("Resolved CreateNew Request", async () => {
        const resolvedUrl = await resolver.resolve(request);
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Test RequestUrl for a data store", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore");

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "/", "Path should match");
        assert.strictEqual(url, `${siteUrl}/datastore`, "Url should match");
    });

    it("Empty string filePath is resolvable", async () => {
        // Arrange
        filePath = "";
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Non-Empty string filePath is resolvable", async () => {
        // Arrange
        filePath = "data1";
        const testRequest: IRequest = {
            url: `https://localhost?driveId=${driveId}&path=${filePath}&itemId=item1`,
            headers: { createNew:{ fileName:`${fileName}` } },
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const [, queryString] = testRequest.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("FilePath with 3 data object ids is resolvable", async () => {
        // Arrange
        filePath = "data1/data2/data3";
        const testRequest: IRequest = {
            url: `https://localhost?driveId=${driveId}&path=${filePath}&itemId=item1`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "item1", "Item id should be equal");
        assert.notStrictEqual(resolvedUrl.hashedDocumentId, "", "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const [, queryString] = testRequest.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("FilePath with 2 ending slashes is resolvable", async () => {
        // Arrange
        filePath = "data1/data2//";
        const testRequest: IRequest = {
            url: `https://localhost?driveId=${driveId}&path=${filePath}&itemId=item1`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "item1", "Item id should be equal");
        assert.notStrictEqual(resolvedUrl.hashedDocumentId, "", "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const [, queryString] = testRequest.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("FilePath with special characters is resolvable", async () => {
        // Arrange
        filePath = "data1/data2/!@$";
        const testRequest: IRequest = {
            url: `https://localhost?driveId=${driveId}&path=${filePath}&itemId=item!@$`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "item!@$", "Item id should be equal");
        assert.notStrictEqual(resolvedUrl.hashedDocumentId, "", "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const [, queryString] = testRequest.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("path"), filePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });
});
