/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDriverUrlResolver } from "../odspDriverUrlResolver";
import { getHashedDocumentId } from "../odspPublicUtils";
import { createOdspCreateContainerRequest } from "../createOdspCreateContainerRequest";

describe("Odsp Driver Resolver", () => {
    const siteUrl = "https://localhost";
    const driveId = "driveId";
    const filePath = "path";
    const fileName = "fileName";
    const packageName = "packageName";
    let resolver: OdspDriverUrlResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new OdspDriverUrlResolver();
        request = createOdspCreateContainerRequest(siteUrl, driveId, filePath, fileName);
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
        const expected: IOdspResolvedUrl = {
            endpoints: {
                snapshotStorageUrl: "",
                attachmentGETStorageUrl: "",
                attachmentPOSTStorageUrl: "",
                deltaStorageUrl: "",
            },
            tokens: {},
            type: "fluid",
            odspResolvedUrl: true,
            id: "odspCreateNew",
            url: "fluid-odsp://https://localhost?driveId=driveId&path=path&version=null",
            siteUrl: "https://localhost",
            hashedDocumentId: "",
            driveId: "driveId",
            itemId: "",
            fileName: "fileName",
            fileVersion: undefined,
            summarizer: false,
            codeHint: { containerPackageName: undefined },
            shareLinkInfo: undefined,
            isClpCompliantApp: undefined,
        };
        assert.deepStrictEqual(resolvedUrl, expected);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore");

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "datastore", "Path should match");
        assert.strictEqual(url, `${siteUrl}`, "Url should match");
    });

    it("Should add codeHint if request contains containerPackageName", async () => {
        const newRequest = request;
        newRequest.url += `&containerPackageName=${encodeURIComponent(packageName)}`;
        const resolvedUrl = await resolver.resolve(request);

        assert.strictEqual(
            resolvedUrl.codeHint?.containerPackageName, packageName, "containerPackageName should match");
    });

    it("Should add shareLinkInfo with link type if request contains createLinkType", async () => {
        const newRequest = request;
        const createLinkType = "csl";
        newRequest.url += `&createLinkType=${createLinkType}`;
        const resolvedUrl = await resolver.resolve(request);
        assert(resolvedUrl.shareLinkInfo !== undefined);
        assert(resolvedUrl.shareLinkInfo.createLink !== undefined);
        assert.strictEqual(resolvedUrl.shareLinkInfo.createLink.type, createLinkType);
    });

    it("Should resolve url with a string in the codeDetails package", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const codeDetails = { package: packageName };
        // codeDetails is cast to any for testing the IFluidCodeDetails approach
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore", codeDetails as any);

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "datastore", "Path should match");
        assert.strictEqual(searchParams.get("containerPackageName"), packageName, "ContainerPackageName should match");
        assert.strictEqual(url, `${siteUrl}`, "Url should match");
    });

    it("Should resolve url given container package info", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore", { name: packageName });

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "datastore", "Path should match");
        assert.strictEqual(searchParams.get("containerPackageName"), packageName, "ContainerPackageName should match");
        assert.strictEqual(url, `${siteUrl}`, "Url should match");
    });

    it("Should resolve url with a IFluidPackage in the codeDetails package", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const fluidPackage: any = {
            name: packageName,
            fluid: {},
        };
        const codeDetails = { package: fluidPackage };
        // codeDetails is cast to any for testing the IFluidCodeDetails approach
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore", codeDetails as any);

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "datastore", "Path should match");
        assert.strictEqual(searchParams.get("containerPackageName"), packageName, "ContainerPackageName should match");
        assert.strictEqual(url, `${siteUrl}`, "Url should match");
    });

    it("Should resolve url with a codeHint in the resolved url", async () => {
        const newRequest = request;
        newRequest.url += `&containerPackageName=${encodeURIComponent(packageName)}`;
        const resolvedUrl = await resolver.resolve(request);
        const response = await resolver.getAbsoluteUrl(resolvedUrl, "/datastore");

        const [url, queryString] = response?.split("?") ?? [];
        const searchParams = new URLSearchParams(queryString);
        assert.strictEqual(searchParams.get("itemId"), resolvedUrl.itemId, "Item id should match");
        assert.strictEqual(searchParams.get("driveId"), driveId, "Drive Id should match");
        assert.strictEqual(searchParams.get("path"), "datastore", "Path should match");
        assert.strictEqual(searchParams.get("containerPackageName"), packageName, "ContainerPackageName should match");
        assert.strictEqual(url, `${siteUrl}`, "Url should match");
    });

    it("Should resolve url with empty file path", async () => {
        // Arrange
        const testFilePath = "";
        request = createOdspCreateContainerRequest(siteUrl, driveId, testFilePath, fileName);

        // Act
        const resolvedUrl = await resolver.resolve(request);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, fileName, "FileName should be equal");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, "", "Item id should be absent");
        assert.strictEqual(resolvedUrl.hashedDocumentId, "", "No doc id should be present");
        assert.strictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be empty");
        assert.strictEqual(
            resolvedUrl.codeHint?.containerPackageName, undefined, "Container Package Name should be undefined");

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
            headers: { createNew: { fileName: `${fileName}` } },
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
        assert.strictEqual(resolvedUrl.hashedDocumentId, await getHashedDocumentId(driveId, itemId),
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
        assert.strictEqual(resolvedUrl.hashedDocumentId, await getHashedDocumentId(driveId, itemId),
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
        assert.strictEqual(resolvedUrl.hashedDocumentId, await getHashedDocumentId(driveId, itemId),
            "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");

        const expectedResolvedUrl = `fluid-odsp://placeholder/placeholder/${resolvedUrl.hashedDocumentId}/`
            + `${testFilePath}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("resolves urls with datastore path in url path", async () => {
        const absoluteUrl = "https://localhost/datastore?driveId=driveId&itemId=&path=/";
        const resolvedUrl = await resolver.resolve({ url: absoluteUrl });

        assert.strictEqual(
            resolvedUrl.url,
            // eslint-disable-next-line max-len
            "fluid-odsp://placeholder/placeholder/AV5r7rhbMqs3T5cL8TUpqk6FpWldev0qKsKlnjkC5mg%3D/?driveId=driveId&itemId=&path=/",
        );
    });

    it("Should resolve url with file version", async () => {
        // Arrange
        const testFilePath = "data1";
        const itemId = "item";
        const fileVersion = "285.0";
        const testRequest: IRequest = {
            url: `${siteUrl}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}&fileVersion=${fileVersion}`,
        };

        // Act
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        // Assert
        assert.strictEqual(resolvedUrl.fileName, "", "FileName should be absent");
        assert.strictEqual(resolvedUrl.driveId, driveId, "Drive id should be equal");
        assert.strictEqual(resolvedUrl.siteUrl, siteUrl, "SiteUrl should be equal");
        assert.strictEqual(resolvedUrl.itemId, itemId, "Item id should be equal");
        assert.strictEqual(resolvedUrl.hashedDocumentId, await getHashedDocumentId(driveId, itemId),
            "Doc id should be present");
        assert.notStrictEqual(resolvedUrl.endpoints.snapshotStorageUrl, "", "Snapshot url should be present");
        assert.strictEqual(resolvedUrl.fileVersion, fileVersion, "FileVersion should be equal");

        const expectedResolvedUrl = `fluid-odsp://placeholder/placeholder/${resolvedUrl.hashedDocumentId}/`
            + `${testFilePath}?driveId=${driveId}&path=${testFilePath}&itemId=${itemId}&fileVersion=${fileVersion}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });
});
