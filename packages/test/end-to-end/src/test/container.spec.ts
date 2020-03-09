/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as API from "@fluid-internal/client-api";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import { IProxyLoaderFactory, IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    IFluidResolvedUrl,
    IGeneralError,
    IDocumentDeltaConnection,
    ErrorType,
} from "@microsoft/fluid-driver-definitions";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { MockDocumentDeltaConnection } from "@microsoft/fluid-test-loader-utils";
import { ConnectionState } from "@microsoft/fluid-protocol-definitions";

describe("Container", () => {
    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    let deltaConnection: MockDocumentDeltaConnection;
    const testRequest: IRequest = { url: "" };
    const pkg: IFluidCodeDetails = {
        package: "@fluid-internal/client-api",
        config: {},
    };
    let service: IDocumentService;
    let codeLoader: API.CodeLoader;
    let loader: Loader;

    beforeEach(async () => {
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
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
                testRequest,
                testResolved);
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
                testRequest,
                testResolved);
        } catch (error) {
            const err = error as IGeneralError;
            success = err.error as boolean;
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
                testRequest,
                testResolved);
        } catch (error) {
            assert.equal(error.errorType, ErrorType.generalError, "Error is not a general error");
            const generalError = error as IGeneralError;
            success = generalError.error as boolean;
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
            testRequest,
            testResolved);
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
            testRequest,
            testResolved);
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
            testRequest,
            testResolved);
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
            testRequest,
            testResolved);
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

    it("Create detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        assert.equal(container.isAttached(), false, "Container should be detached");
        assert.equal(container.closed, false, "Container should be open");
        assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.equal(container.getQuorum().getMembers().size, 0, "Quorum should not contain any memebers");
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should be in disconnected state!!");
        assert.equal(container.chaincodePackage.package, pkg.package,
            "Package should be same as provided");
        assert.equal(container.id, "", "Detached container's id should be empty string");
    });

    it("Attach detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        await container.attach(testResolver, testRequest);
        assert.equal(container.isAttached(), true, "Container should be attached");
        assert.equal(container.closed, false, "Container should be open");
        assert.equal(container.deltaManager.inbound.length, 0, "Inbound queue should be empty");
        assert.equal(container.connectionState, ConnectionState.Disconnected,
            "Container should still be in disconnected state!!");
        assert.equal(container.id, "documentId", "Doc id is not matching!!");
    });

    it("Components in detached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });
        if (response.mimeType !== "fluid/component" && response.status !== 200) {
            assert.fail("Root component should be created in detached container");
        }
        const component = response.value as API.Document;
        const testCompId = "TestComponent1";
        await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");
        const testResponse = await container.request({url: `/${testCompId}`});
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as API.Document;
        assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), false, "Channel should be registered!!");
    });

    it("Components in attached container", async () => {
        const container = await loader.createDetachedContainer(pkg);
        const response = await container.request({ url: "/" });
        const component = response.value as API.Document;
        const testCompId = "TestComponent1";
        await component.runtime.createAndAttachComponent(testCompId, "@fluid-internal/client-api");

        // Now attach the container
        await container.attach(testResolver, testRequest);
        const testResponse = await container.request({url: `/${testCompId}`});
        if (testResponse.mimeType !== "fluid/component" && testResponse.status !== 200) {
            assert.fail("New components should be created in detached container");
        }
        const testComponent = testResponse.value as API.Document;
        assert.equal(testComponent.runtime.isAttached, true, "Component should be attached!!");
        const testChannel = await testComponent.runtime.getChannel("root");
        assert.equal(testChannel.isRegistered(), true, "Channel should be registered!!");
        assert.equal(testChannel.isLocal(), false, "Channel should be registered!!");
    });
});
