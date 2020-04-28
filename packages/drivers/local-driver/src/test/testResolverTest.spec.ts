/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { CreateNewHeader, IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { TestResolver } from "../testResolver";

describe("Local Driver Resolver", () => {

    const tenantId = "tenantId";
    const fileName = "fileName";
    let resolver: TestResolver;
    let request: IRequest;

    beforeEach(() => {
        resolver = new TestResolver(fileName);
        request = resolver.createCreateNewRequest();
    });

    it("Create New Request", async () => {
        assert(!!request.headers?.[CreateNewHeader.createNew],
            "Request should contain create new header");
        const url = `http://localhost:3000/${tenantId}/${fileName}`;
        assert.equal(request.url, url, "Request url should match");
    });

    it("Resolved CreateNew Request", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const url = `fluid-test://localhost:3000/${tenantId}/${fileName}`;
        assert.equal((resolvedUrl as IFluidResolvedUrl).url, url, "url should match");
    });

    it("Test RequestUrl for a component", async () => {
        const resolvedUrl = await resolver.resolve(request);
        const componentId = "component";
        const response = await resolver.requestUrl(resolvedUrl, { url: componentId });

        assert.equal(response.status, "200", "Status code should ve 200");
        assert.equal(response.mimeType, "text/plain", "Mime type should be text/plain");
        const [url] = response.value.split("?");
        assert.equal(url, `https://localhost:3000/${tenantId}/${fileName}/${componentId}`, "Url should match");
    });
});
