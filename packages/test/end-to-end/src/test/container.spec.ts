/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@fluid-internal/client-api";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";

describe("Container", () => {
    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    const testRequest: IRequest = { url: "", headers: { connect: "open" }};
    let service: IDocumentService;
    let codeLoader: API.CodeLoader;
    let loader: Loader;

    beforeEach(async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.create();
        testResolver = new TestResolver();
        testResolved = await testResolver.resolve(testRequest) as IFluidResolvedUrl;
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        service = await serviceFactory.createDocumentService(testResolved);
        const host = { resolver: testResolver };

        codeLoader = new API.CodeLoader({ generateSummaries: false });
        const options = {};

        loader = new Loader(host, serviceFactory, codeLoader, options, {});
    });

    it("Load container successfully", async () => {
        let success: boolean;
        try {
            await Container.load(
                "tenantId/documentId",
                service,
                codeLoader,
                {},
                {},
                loader,
                testRequest);
            success = true;
        } catch (error) {
            success = false;
        }
        assert.equal(success, true);
    });

    it("Load container unsuccessfully", async () => {
        let success: boolean = true;
        try {
            service.connectToStorage = (): Promise<IDocumentStorageService> => {
                return Promise.reject(false);
            };
            await Container.load(
                "tenantId/documentId",
                service,
                codeLoader,
                {},
                {},
                loader,
                testRequest);
        } catch (error) {
            success = error as boolean;
        }
        assert.equal(success, false);
    });

    it("Load container with error", async () => {
        let success: boolean = true;
        try {
            service.connectToDeltaStorage = async (): Promise<IDocumentDeltaStorageService> => {
                return Promise.reject(false);
            };
            await Container.load(
                "tenantId/documentId",
                service,
                codeLoader,
                {},
                {},
                loader,
                testRequest);
        } catch (error) {
            success = error as boolean;
        }
        assert.equal(success, false);
    });
});
