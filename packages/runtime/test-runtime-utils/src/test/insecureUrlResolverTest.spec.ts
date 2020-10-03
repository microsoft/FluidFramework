/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { CreateNewHeader, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IUser } from "@fluidframework/protocol-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureUrlResolver } from "../insecureUrlResolver";

describe("Insecure Url Resolver Test", () => {
    const hostUrl = "https://localhost";
    const ordererUrl = "https://localhost.orderer";
    const storageUrl = "https://localhost.storage";
    const tenantId = "tenantId";
    const tenantKey = "tenantKey";
    const bearer = "bearer";
    const user: IUser = {
        id: "userId",
    };
    const fileName = "fileName";
    let resolver: InsecureUrlResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new InsecureUrlResolver(hostUrl, ordererUrl, storageUrl, tenantId, tenantKey, user, bearer);
        request = resolver.createCreateNewRequest(fileName);
    });

    it("Create New Request", async () => {
        assert(!!request.headers?.[CreateNewHeader.createNew],
            "Request should contain create new header");
        const url = `${hostUrl}?fileName=${fileName}`;
        assert.strictEqual(request.url, url, "Request url should match");
    });

    it("Resolved CreateNew Request", async () => {
        const resolvedUrl = await resolver.resolve(request) as IFluidResolvedUrl;
        const documentUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
        assert.strictEqual(resolvedUrl.endpoints.ordererUrl, ordererUrl, "Orderer url should match");
        assert.strictEqual(resolvedUrl.url, documentUrl, "Document url should match");
    });

    it("Test RequestUrl for a data store", async () => {
        const resolvedUrl = await resolver.resolve(request);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");

        const dataStoreId = "dataStore";
        const absoluteUrl = await resolver.getAbsoluteUrl(resolvedUrl, dataStoreId);

        const expectedUrl = `${hostUrl}/${tenantId}/${fileName}/${dataStoreId}`;
        assert.strictEqual(absoluteUrl, expectedUrl, "Url should match");
    });

    it("Test RequestUrl for url with only document id", async () => {
        const testRequest: IRequest = {
            url: `https://localhost/${fileName}`,
            headers: {},
        };
        // Mocking window since the resolver depends on window.location.host
        if (typeof window === "undefined" && typeof global === "object") {
            // eslint-disable-next-line dot-notation
            global["window"] = { location: { host:"localhost" } };
        }
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with data store ids", async () => {
        const testRequest: IRequest = {
            url: `https://localhost/${fileName}/dataStore1/dataStore2`,
            headers: {},
        };
        // Mocking window since the resolver depends on window.location.host
        if (typeof window === "undefined" && typeof global === "object") {
            // eslint-disable-next-line dot-notation
            global["window"] = { location: { host:"localhost" } };
        }

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}/dataStore1/dataStore2`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");

        const dataStoreId = "dataStore";
        const absoluteUrl = await resolver.getAbsoluteUrl(resolvedUrl, dataStoreId);

        const expectedResponseUrl = `${hostUrl}/${tenantId}/${fileName}/${dataStoreId}`;
        assert.strictEqual(absoluteUrl, expectedResponseUrl, "response url is wrong");
    });

    it("Test RequestUrl for url with a slash at the end", async () => {
        const testRequest: IRequest = {
            url: `https://localhost/${fileName}/`,
            headers: {},
        };
        // Mocking window since the resolver depends on window.location.host
        if (typeof window === "undefined" && typeof global === "object") {
            // eslint-disable-next-line dot-notation
            global["window"] = { location: { host:"localhost" } };
        }
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}/`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with 2 slashes at the end", async () => {
        const testRequest: IRequest = {
            url: `https://localhost/${fileName}//`,
            headers: {},
        };
        // Mocking window since the resolver depends on window.location.host
        if (typeof window === "undefined" && typeof global === "object") {
            // eslint-disable-next-line dot-notation
            global["window"] = { location: { host:"localhost" } };
        }
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}//`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with special characters", async () => {
        const testRequest: IRequest = {
            url: `https://localhost/${fileName}/!@$123/dataStore!@$`,
            headers: {},
        };
        // Mocking window since the resolver depends on window.location.host
        if (typeof window === "undefined" && typeof global === "object") {
            // eslint-disable-next-line dot-notation
            global["window"] = { location: { host:"localhost" } };
        }
        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `fluid://${new URL(ordererUrl).host}/${tenantId}/${fileName}/!@$123/dataStore!@$`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });
});
