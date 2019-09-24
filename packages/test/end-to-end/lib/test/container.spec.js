/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as API from "@fluid-internal/client-api";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import * as assert from "assert";
import { TestDeltaConnectionServer, TestDocumentServiceFactory, TestResolver, } from "@microsoft/fluid-local-test-server";
describe("Container", () => {
    let testDeltaConnectionServer;
    let testResolver;
    let testResolved;
    const testRequest = { url: "" };
    let service;
    let codeLoader;
    let loader;
    beforeEach(async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.create();
        testResolver = new TestResolver();
        testResolved = await testResolver.resolve(testRequest);
        const serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        service = await serviceFactory.createDocumentService(testResolved);
        const host = { resolver: testResolver };
        codeLoader = new API.CodeLoader({ generateSummaries: false });
        const options = {};
        loader = new Loader(host, serviceFactory, codeLoader, options, {});
    });
    it("Load container successfully", async () => {
        let success;
        try {
            await Container.load("tenantId/documentId", undefined, service, codeLoader, {}, {}, "open", loader, testRequest, true);
            success = true;
        }
        catch (error) {
            success = false;
        }
        assert.equal(success, true);
    });
    it("Load container unsuccessfully", async () => {
        let success = true;
        try {
            service.connectToStorage = () => {
                return Promise.reject(false);
            };
            await Container.load("tenantId/documentId", undefined, service, codeLoader, {}, {}, "open", loader, testRequest, true);
        }
        catch (error) {
            success = error;
        }
        assert.equal(success, false);
    });
    it("Load container with error", async () => {
        let success = true;
        try {
            service.connectToDeltaStorage = async () => {
                return Promise.reject(false);
            };
            await Container.load("tenantId/documentId", undefined, service, codeLoader, {}, {}, "open", loader, testRequest, true);
        }
        catch (error) {
            success = error;
        }
        assert.equal(success, false);
    });
});
//# sourceMappingURL=container.spec.js.map