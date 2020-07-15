/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { CreateNewHeader, IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { IRequest } from "@fluidframework/component-core-interfaces";
import { LocalResolver } from "../localResolver";

describe("Local Driver Resolver", () => {
    const documentId = "localResolverTest";
    let resolver: LocalResolver;

    describe("CreateNew Flow", () => {
        let request: IRequest;

        beforeEach(() => {
            resolver = new LocalResolver();
            request = resolver.createCreateNewRequest(documentId);
        });

        it("should successfully create a creatNewRequest", async () => {
            assert(!!request.headers?.[CreateNewHeader.createNew],
                "Request should contain create new header");
            const expectedUrl = `http://localhost:3000/${documentId}`;
            assert.equal(request.url, expectedUrl, "The url in createNewRequest should match");
        });

        it("should successfully resolve a createNewRequest", async () => {
            const resolvedUrl = await resolver.resolve(request) as IFluidResolvedUrl;
            const expectedUrl = `fluid-test://localhost:3000/tenantId/${documentId}`;
            assert.equal(resolvedUrl.url, expectedUrl, "The resolved url should match");
        });

        it("should successfully create requestUrl for a component from resolvedUrl", async () => {
            const resolvedUrl = await resolver.resolve(request);
            const componentId = "component";
            const response = await resolver.getAbsoluteUrl(resolvedUrl, componentId);
            const expectedUrl = `http://localhost:3000/${documentId}/${componentId}`;
            assert.equal(response, expectedUrl, "The requestUrl should match");
        });
    });

    describe("Container Request Resolution", () => {
        beforeEach(() => {
            resolver = new LocalResolver();
        });

        it("should successfully resolve request for a container url", async () => {
            const url = `http://localhost/${documentId}`;
            const resolvedUrl = await resolver.resolve({ url }) as IFluidResolvedUrl;
            const expectedUrl = `fluid-test://localhost:3000/tenantId/${documentId}`;
            assert.equal(resolvedUrl.url, expectedUrl, "The resolved container url should match");
        });
    });
});
