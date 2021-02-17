/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IGenericError,
    ContainerErrorType,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import { Container, ConnectionState, Loader, ILoaderProps } from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import { MockDocumentDeltaConnection } from "@fluid-internal/test-loader-utils";
import { LocalCodeLoader, TestObjectProvider, LoaderContainerTracker } from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import { createPrimedDataStoreFactory, createRuntimeFactory, TestDataObject } from "./compatUtils";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };

describe("Container", () => {
    let driver: ITestDriver;
    const loaderContainerTracker = new LoaderContainerTracker();
    beforeEach(()=>{
        driver = getFluidTestDriver();
    });
    afterEach(() => {
        loaderContainerTracker.reset();
    });
    async function loadContainer(props?: Partial<ILoaderProps>) {
        const loader =  new Loader({
            ... props,
            urlResolver: props?.urlResolver ?? driver.createUrlResolver(),
            documentServiceFactory :
                props?.documentServiceFactory ?? driver.createDocumentServiceFactory(),
            codeLoader: props?.codeLoader ?? new LocalCodeLoader([]),
        });
        loaderContainerTracker.add(loader);

        const testResolved = await loader.services.urlResolver.resolve(testRequest);
        ensureFluidResolvedUrl(testResolved);
        return Container.load(
            "documentId",
            loader,
            testRequest.url,
            testResolved,
            {
                canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
                clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
                version: testRequest.headers?.[LoaderHeader.version],
                pause: testRequest.headers?.[LoaderHeader.pause],
            },
        );
    }

    it("Load container successfully", async () => {
        const container = await loadContainer();
        assert.strictEqual(container.id, "documentId", "Container's id should be set");
        assert.strictEqual(container.clientDetails.capabilities.interactive, true,
            "Client details should be set with interactive as true");
    });

    it("Load container unsuccessfully", async () => {
        let success: boolean = true;
        try {
            const documentServiceFactory = driver.createDocumentServiceFactory();
            const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
            // Issue typescript-eslint/typescript-eslint #1256
            mockFactory.createDocumentService = async (resolvedUrl) => {
                const service = await documentServiceFactory.createDocumentService(resolvedUrl);
                // Issue typescript-eslint/typescript-eslint #1256
                // eslint-disable-next-line prefer-promise-reject-errors
                service.connectToStorage = async () => Promise.reject(false);
                return service;
            };

            await loadContainer({ documentServiceFactory: mockFactory });
            assert.fail("Error expected");
        } catch (error) {
            const err = error as IGenericError;
            success = err.error as boolean;
        }
        assert.strictEqual(success, false);
    });

    it("Load container with error", async () => {
        let success: boolean = true;
        try {
            const documentServiceFactory = driver.createDocumentServiceFactory();
            const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
            // Issue typescript-eslint/typescript-eslint #1256
            mockFactory.createDocumentService = async (resolvedUrl) => {
                const service = await documentServiceFactory.createDocumentService(resolvedUrl);
                // Issue typescript-eslint/typescript-eslint #1256
                // eslint-disable-next-line prefer-promise-reject-errors
                service.connectToDeltaStorage = async () => Promise.reject(false);
                return service;
            };
            await loadContainer({ documentServiceFactory: mockFactory });
            assert.fail("Error expected");
        } catch (error) {
            assert.strictEqual(error.errorType, ContainerErrorType.genericError, "Error is not a general error");
            const genericError = error as IGenericError;
            success = genericError.error as boolean;
        }
        assert.strictEqual(success, false);
    });

    it("Raise disconnected event", async () => {
        const deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const documentServiceFactory = driver.createDocumentServiceFactory();
        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };

        const container = await loadContainer({ documentServiceFactory: mockFactory });
        assert.strictEqual(container.connectionState, ConnectionState.Connecting,
            "Container should be in Connecting state");
        deltaConnection.close();
        assert.strictEqual(container.connectionState, ConnectionState.Disconnected,
            "Container should be in Disconnected state");
        deltaConnection.removeAllListeners();
    });

    it("Raise connection error event", async () => {
        const deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const documentServiceFactory = driver.createDocumentServiceFactory();
        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };
        let errorRaised = false;
        const container = await loadContainer({ documentServiceFactory: mockFactory });
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
        // All errors on socket are not critical!
        assert.strictEqual(container.closed, false, "Container should not be closed");
        assert.strictEqual(errorRaised, false, "Error event should not be raised.");
        deltaConnection.removeAllListeners();
    });

    it("Close called on container", async () => {
        const deltaConnection = new MockDocumentDeltaConnection(
            "test",
        );
        const documentServiceFactory = driver.createDocumentServiceFactory();
        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        // Issue typescript-eslint/typescript-eslint #1256
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            // Issue typescript-eslint/typescript-eslint #1256
            service.connectToDeltaStream = async () => deltaConnection;
            return service;
        };
        const container = await loadContainer({ documentServiceFactory: mockFactory });
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

    it("Delta manager receives readonly event when calling container.forceReadonly()", async () => {
        const runtimeFactory = (_?: unknown) => createRuntimeFactory(
            TestDataObject.type,
            createPrimedDataStoreFactory());

        const localTestObjectProvider = new TestObjectProvider(
            driver,
            runtimeFactory);

        const container = await localTestObjectProvider.makeTestContainer() as Container;
        const dataObject = await requestFluidObject<TestDataObject>(container, "default");

        let runCount = 0;

        dataObject._context.deltaManager.on("readonly", () => {
            runCount++;
        });

        container.forceReadonly(true);
        assert.strictEqual(container.readonly, true);

        assert.strictEqual(runCount, 1);
    });
});
