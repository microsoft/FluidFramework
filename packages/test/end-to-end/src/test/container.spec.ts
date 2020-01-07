/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as API from "@fluid-internal/client-api";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IDocumentDeltaConnection,
} from "@microsoft/fluid-driver-definitions";
import {
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { MockDocumentDeltaConnection } from "@microsoft/fluid-test-loader-utils";
import * as assert from "assert";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";

describe("Container", () => {
    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    let deltaConnection: MockDocumentDeltaConnection;
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

        loader = new Loader(host, serviceFactory, codeLoader, options, {}, new Map<string, IProxyLoaderFactory>());
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

    it("Raise disconnected event", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        service.connectToDeltaStream = async (): Promise<IDocumentDeltaConnection> => {
            return deltaConnection;
        };

        const container = await Container.load(
            "tenantId/documentId",
            service,
            codeLoader,
            {},
            {},
            loader,
            testRequest);
        assert.equal(container.connectionState, ConnectionState.Connecting);
        deltaConnection.disconnect();
        assert.equal(container.connectionState, ConnectionState.Disconnected);
        deltaConnection.removeAllListeners();
    });

    it("Raise error event", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        service.connectToDeltaStream = async (): Promise<IDocumentDeltaConnection> => {
            return deltaConnection;
        };

        const container = await Container.load(
            "tenantId/documentId",
            service,
            codeLoader,
            {},
            {},
            loader,
            testRequest);
            assert.equal(container.connectionState, ConnectionState.Connecting);
            deltaConnection.emitError("Test Error");
            assert.equal(container.connectionState, ConnectionState.Disconnected);
            deltaConnection.removeAllListeners();
    });
});
