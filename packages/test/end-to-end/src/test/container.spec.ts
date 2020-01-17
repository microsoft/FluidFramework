/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
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

        codeLoader = new API.CodeLoader({ generateSummaries: false });
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
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
            service.connectToStorage = async (): Promise<IDocumentStorageService> => {
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
            // Issue typescript-eslint/typescript-eslint #1256
            // eslint-disable-next-line @typescript-eslint/unbound-method
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
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
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
        assert.equal(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        deltaConnection.disconnect();
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        deltaConnection.removeAllListeners();
    });

    it("Raise error event", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
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
        assert.equal(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        deltaConnection.emitError("Test Error");
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.equal(container.closed, false, "Container should not be closed");
        deltaConnection.removeAllListeners();
    });

    it("Raise critical error event with checking error raised on container", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
        service.connectToDeltaStream = async (): Promise<IDocumentDeltaConnection> => {
            return deltaConnection;
        };
        let errorRaised = false;
        const container = await Container.load(
            "tenantId/documentId",
            service,
            codeLoader,
            {},
            {},
            loader,
            testRequest);
        container.on("error", (error) => {
            errorRaised = true;
        });
        assert.equal(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        const err = {
            message: "Test error",
            canRetry: false,
        };
        deltaConnection.emitError(err);
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.equal(container.closed, true, "Container should be closed");
        assert.equal(errorRaised, true, "Error event should be raised.");
        deltaConnection.removeAllListeners();
    });

    it("Close called on container", async () => {
        deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        // Issue typescript-eslint/typescript-eslint #1256
        // eslint-disable-next-line @typescript-eslint/unbound-method
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
        container.on("error", (error) => {
            assert.ok(false, "Error event should not be raised.");
        });
        assert.equal(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        container.close();
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        assert.equal(container.closed, true, "Container should be closed");
        deltaConnection.removeAllListeners();
    });
});
