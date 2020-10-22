/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// import { DriverHeader, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
// import { IUser } from "@fluidframework/protocol-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { InsecureTinyliciousUrlResolver } from "../getTinyliciousContainer";

describe("Insecure Url Resolver Test", () => {
    const documentId = "fileName";
    const hostUrl = "fluid://localhost:3000";
    let resolver: InsecureTinyliciousUrlResolver;

    beforeEach(() => {
        resolver = new InsecureTinyliciousUrlResolver();
    });

    it("Test RequestUrl for url with only document id", async () => {
        const testRequest: IRequest = {
            url: `${documentId}`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with data object ids", async () => {
        const path = "dataObject1/dataObject2";
        const testRequest: IRequest = {
            url: `${documentId}/${path}`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/${path}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with a slash at the end", async () => {
        const testRequest: IRequest = {
            url: `${documentId}/`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with 2 slashes at the end", async () => {
        const testRequest: IRequest = {
            url: `${documentId}//`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}//`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });

    it("Test RequestUrl for url with special characters", async () => {
        const path = "dataObject!@";
        const testRequest: IRequest = {
            url: `${documentId}/${path}`,
            headers: {},
        };

        const resolvedUrl = await resolver.resolve(testRequest);
        ensureFluidResolvedUrl(resolvedUrl);

        const expectedResolvedUrl = `${hostUrl}/tinylicious/${documentId}/${path}`;
        assert.strictEqual(resolvedUrl.url, expectedResolvedUrl, "resolved url is wrong");
    });
});
