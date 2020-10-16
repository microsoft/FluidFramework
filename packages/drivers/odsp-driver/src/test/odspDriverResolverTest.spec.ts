/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CreateNewHeader } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";

describe("Odsp Driver Resolver", () => {
    const siteUrl = "www.localhost.xxx";
    const driveId = "driveId";
    let filePath = "path";
    const fileName = "fileName";
    const packageName = "packageName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    });

    it("Create New Request", async () => {
        assert.equal(request.headers?.[CreateNewHeader.createNew].fileName, fileName,
            "Request should contain fileName");
        const url = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
        assert.equal(request.url, url, "Request url should match");
    });

    it("Resolved CreateNew Request", async () => {
        const resolvedUrl = await resolver.resolve(request);
        assert.equal(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.equal(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.equal(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.equal(resolvedUrl.itemId, "", "Item id should be absent");
        assert.equal(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.equal(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");
        assert.equal(
            resolvedUrl.codeHint?.containerPackageName, undefined, "Container Package Name should be undefined");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("path"), filePath, "filePath should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Test RequestUrl for a data store", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore");

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.equal(searchParams.get("path"), "/", "Path should match");
        assert.equal(url, `${siteUrl}/datastore`, "Url should match");
    });

    it("Empty string filePath is resolvable", async () => {
        // Arrange
        filePath = "";
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.equal(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.equal(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.equal(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.equal(resolvedUrl.itemId, "", "Item id should be absent");
        assert.equal(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.equal(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");
        assert.equal(
            resolvedUrl.codeHint?.containerPackageName, undefined, "Container Package Name should be undefined");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("path"), filePath, "filePath should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Request containing packageName", async () => {
        // Arrange
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName, packageName);

        // Assert
        const url = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath,
            )}&containerPackageName=${encodeURIComponent(packageName)}`;
        assert.equal(request.url, url, "Request url should include packageName");
    });

    it("Resolved Request with package name", async () => {
        // Arrange
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName, packageName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.equal(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.equal(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.equal(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.equal(resolvedUrl.itemId, "", "Item id should be absent");
        assert.equal(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.equal(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");
        assert.equal(resolvedUrl.codeHint?.containerPackageName, packageName, "Container Package Name should be equal");

        const [, queryString] = request.url.split("?");
        const searchParams = new URLSearchParams(queryString);
        assert.equal(searchParams.get("path"), filePath, "filePath should match");
        assert.equal(searchParams.get("driveId"), driveId, "Drive id should match");
    });
});
