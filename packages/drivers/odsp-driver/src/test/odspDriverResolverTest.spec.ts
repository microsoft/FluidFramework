/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { getHashedDocumentId } from "../odspUtils";

describe("Odsp Driver Resolver", () => {
    const siteUrl = "https://localhost";
    const driveId = "driveId";
    const filePath = "path";
    const fileName = "fileName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = resolver.createCreateNewRequest(siteUrl, driveId, filePath, fileName);
    });

    it("Can create new request", async () => {
        assert.strictEqual(request.headers?.[DriverHeader.createNew].fileName, fileName,
            "Request should contain fileName");
        const url = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
        assert.strictEqual(request.url, url, "Request url should match");
    });

    it("Should resolve createNew request", async () => {
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

    it("Should resolve url with a data store", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore");

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "/", "Path should match");
        assert.strictEqual(url, `${siteUrl}/datastore`, "Url should match");
    });

    it("Should resolve url with empty file path", async () => {
        // Arrange
        const testFilePath = "";
        request = resolver.createCreateNewRequest(siteUrl, driveId, testFilePath, fileName);

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
        assert.strictEqual(searchParams.get("path"), testFilePath, "filePath should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive id should match");
    });

    it("Should resolve url with non-empty file path and item id", async () => {
        // Arrange
        const testFilePath = "data1";
        const itemId = "item1";
        const testRequest: IRequest = {
            url: `${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`,
            headers: { createNew:{ fileName:`${fileName}` } },
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");

        const expectedResolvedUrl = `fluid-odsp://${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`
        + `&version=null`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with file path containing 3 data object ids", async () => {
        // Arrange
        const testFilePath = "data1/data2/data3";
        const itemId = "item1";
        const testRequest: IRequest = {
            url: `${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
        assert.strictEqual(resolvedUrl.hashedDocumentId, getHashedDocumentId(driveId, itemId),
            "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const expectedResolvedUrl = `fluid-odsp://placeholder/placeholder/${resolvedUrl.hashedDocumentId}/`
            + `${testFilePath}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with file path containing ending slashes", async () => {
        // Arrange
        const testFilePath = "data1/data2//";
        const itemId = "item1";
        const testRequest: IRequest = {
            url: `${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
        assert.strictEqual(resolvedUrl.hashedDocumentId, getHashedDocumentId(driveId, itemId),
            "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const expectedResolvedUrl = `fluid-odsp://placeholder/placeholder/${resolvedUrl.hashedDocumentId}/`
            + `${testFilePath}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with special characters", async () => {
        // Arrange
        const testFilePath = "data1/data2/!@$";
        const itemId = "item!@$";
        const testRequest: IRequest = {
            url: `${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
        assert.strictEqual(resolvedUrl.hashedDocumentId, getHashedDocumentId(driveId, itemId),
            "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const expectedResolvedUrl = `fluid-odsp://placeholder/placeholder/${resolvedUrl.hashedDocumentId}/`
            + `${testFilePath}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });
});
