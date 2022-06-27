/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "../insecureTinyliciousUrlResolver";

describe("Insecure Url Resolver Test", () => {
    const documentId = "fileName";
    const hostUrl = "fluid://localhost:3000";
    let resolver: InsecureTinyliciousUrlResolver;

    beforeEach(() => {
        resolver = new InsecureTinyliciousUrlResolver();
    });

    it("Should resolve url with only document id", async () => {
        const testRequest: IRequest = {
            url: `${documentId}`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with custom domain and port", async () => {
        const customEndpoint = "http://custom-endpoint.io";
        const customFluidEndpoint = "fluid://custom-endpoint.io";
        const customPort = 1234;
        const customResolver = new InsecureTinyliciousUrlResolver(customPort, customEndpoint);
        const testRequest: IRequest = {
            url: `${documentId}`,
            headers: {},
        };

        const resolvedUrl = await customResolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${customFluidEndpoint}/tinylicious/${documentId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with data object ids", async () => {
        const path = "dataObject1/dataObject2";
        const testRequest: IRequest = {
            url: `${documentId}/${path}`,
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/${path}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with a slash at the end", async () => {
        const testRequest: IRequest = {
            url: `${documentId}/`,
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with 2 slashes at the end", async () => {
        const testRequest: IRequest = {
            url: `${documentId}//`,
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}//`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Should resolve url with special characters", async () => {
        const path = "dataObject!@$";
        const testDocumentId = "fileName!@$";
        const testRequest: IRequest = {
            url: `${testDocumentId}/${path}`,
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${encodeURIComponent(testDocumentId)}/${path}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });
});
