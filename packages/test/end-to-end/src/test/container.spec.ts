/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    IFluidResolvedUrl,
    IGeneralError,
    ErrorType,
    IDocumentServiceFactory,
} from "@microsoft/fluid-driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { MockDocumentDeltaConnection } from "@microsoft/fluid-test-loader-utils";
import { LocalCodeLoader } from "@microsoft/fluid-test-utils";

describe("Container", () => {
    const id = "fluid-test://localhost/containerTest";
    const testRequest: IRequest = { url: id };

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    let deltaConnection: MockDocumentDeltaConnection;
    let serviceFactory: Readonly<IDocumentServiceFactory>;
    let codeLoader: LocalCodeLoader;
    let loader: Loader;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        testResolver = new TestResolver();
        testResolved = await testResolver.resolve(testRequest) as IFluidResolvedUrl;
        serviceFactory = new TestDocumentServiceFactory(testDeltaConnectionServer);
        codeLoader = new LocalCodeLoader([]);
        const options = {};

        loader = new Loader(
            testResolver,
            serviceFactory,
            codeLoader,
            options,
            {},
            new Map<string, IProxyLoaderFactory>(),
        );
    });

    it("Load container successfully", async () => {
        let success: boolean;
        try {
            await Container.load(
                "tenantId/documentId",
                serviceFactory,
                codeLoader,
                {},
                {},
                loader,
                testRequest,
                testResolved,
                testResolver);
            success = true;
        } catch (error) {
            success = false;
        }
        assert.strictEqual(success, true);
    });

    it("Load container unsuccessfully", async () => {
        let success: boolean = true;
        try {
            const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            mockFactory.createDocumentService = async (resolvedUrl) => {
                const service = await serviceFactory.createDocumentService(resolvedUrl);
                // Issue typescript-eslint/typescript-eslint #1256
                // eslint-disable-next-line @typescript-eslint/unbound-method
                service.connectToStorage = async ()=> Promise.reject(false);
                return service;
            };

            await Container.load(
                "tenantId/documentId",
                mockFactory,
                codeLoader,
                {},
                {},
                loader,
                testRequest,
                testResolved,
                testResolver);
            assert.fail("Error expected");
        } catch (error) {
            const err = error as IGeneralError;
            success = err.error as boolean;
        }
        assert.strictEqual(success, false);
    });

    it("Load container with error", async () => {
        let success: boolean = true;
        try {
            const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            mockFactory.createDocumentService = async (resolvedUrl) => {
                const service = await serviceFactory.createDocumentService(resolvedUrl);
                // Issue typescript-eslint/typescript-eslint #1256
                // eslint-disable-next-line @typescript-eslint/unbound-method
                service.connectToDeltaStorage = async () => Promise.reject(false);
                return service;
            };
            await Container.load(
                "tenantId/documentId",
                mockFactory,
                codeLoader,
                {},
                {},
                loader,
                testRequest,
                testResolved,
                testResolver);
            assert.fail("Error expected");
        } catch (error) {
            assert.strictEqual(error.errorType, ErrorType.generalError, "Error is not a general error");
            const generalError = error as IGeneralError;
            success = generalError.error as boolean;
        }
        assert.strictEqual(success, false);
    });

    it("Raise disconnected event", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await serviceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };

        const container = await Container.load(
            "tenantId/documentId",
            mockFactory,
            codeLoader,
            {},
            {},
            loader,
            testRequest,
            testResolved,
            testResolver);
        assert.strictEqual(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        deltaConnection.disconnect();
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        deltaConnection.removeAllListeners();
    });

    it("Raise error event", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await serviceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };

        const container = await Container.load(
            "tenantId/documentId",
            mockFactory,
            codeLoader,
            {},
            {},
            loader,
            testRequest,
            testResolved,
            testResolver);
        assert.strictEqual(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        deltaConnection.emitError("Test Error");
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.strictEqual(container.closed, false, "Container should not be closed");
        deltaConnection.removeAllListeners();
    });

    it("Raise critical error event with checking error raised on container", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await serviceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };
        let errorRaised = false;
        const container = await Container.load(
            "tenantId/documentId",
            mockFactory,
            codeLoader,
            {},
            {},
            loader,
            testRequest,
            testResolved,
            testResolver);
        container.on("error", () => {
            errorRaised = true;
        });
        assert.strictEqual(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        const err = {
            message: "Test error",
            canRetry: false,
        };
        deltaConnection.emitError(err);
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.strictEqual(container.closed, true, "Container should be closed");
        assert.strictEqual(errorRaised, true, "Error event should be raised.");
        deltaConnection.removeAllListeners();
    });

    it("Close called on container", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const mockFactory = Object.create(serviceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await serviceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };
        const container = await Container.load(
            "tenantId/documentId",
            mockFactory,
            codeLoader,
            {},
            {},
            loader,
            testRequest,
            testResolved,
            testResolver);
        container.on("error", () => {
            assert.ok(false, "Error event should not be raised.");
        });
        assert.strictEqual(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        container.close();
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.strictEqual(container.closed, true, "Container should be closed");
        deltaConnection.removeAllListeners();
    });

    it("Check client details and Id", async () => {
        const container = await Container.load(
            "tenantId/documentId",
            serviceFactory,
            codeLoader,
            {},
            {},
            loader,
            testRequest,
            testResolved,
            testResolver);
        assert.strictEqual(container.id, "documentId", "Container's id should be set");
        assert.strictEqual(container.clientDetails.capabilities.interactive, true,
            "Client details should be set with interactive as true");
    });
});
