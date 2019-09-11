/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@prague/client-api";
import { IRequest } from "@prague/component-core-interfaces";
import { Container, Loader } from "@prague/container-loader";
import { IDocumentService, IDocumentStorageService, IFluidResolvedUrl } from "@prague/protocol-definitions";
import * as assert from "assert";
import { ITestDeltaConnectionServer, TestDeltaConnectionServer, TestDocumentServiceFactory, TestResolver } from "..";

describe("Container", () => {
    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    const testRequest: IRequest = { url: "" };
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

        loader = new Loader(host, serviceFactory, codeLoader, options);
    });

    it("Load container successfully", async () => {
        let message: string;
        try {
            await Container.load(
                "tenantId/documentId",
                undefined,
                service,
                codeLoader,
                {},
                "open",
                loader,
                testRequest,
                true);
            message = "success";
        } catch (error) {
            message = "failed";
        }
        assert.equal(message, "success");
    });

    it("Load container unsuccessfully", async () => {
        let message: string;
        try {
            service.connectToStorage = (): Promise<IDocumentStorageService> => {
                return Promise.reject("failed");
            };
            await Container.load(
                "tenantId/documentId",
                undefined,
                service,
                codeLoader,
                {},
                "open",
                loader,
                testRequest,
                true);
            message = "success";
        } catch (error) {
            message = error as string;
        }
        assert.equal(message, "failed");
    });

    it("Load container with error", async () => {
        let message: string;
        try {
            const container: Container = await Container.load(
                "tenantId/documentId",
                undefined,
                service,
                codeLoader,
                {},
                "open",
                loader,
                testRequest,
                true);
            container.once("error", (error) => {
                message = error as string;
            });
            container.emit("error", "errorRaised");
        } catch (error) {
            message = error as string;
        }
        assert.equal(message, "errorRaised");
    });
});
