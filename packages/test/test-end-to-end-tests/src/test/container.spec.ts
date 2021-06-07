/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidCodeDetails, IRequest } from "@fluidframework/core-interfaces";
import {
    IGenericError,
    ContainerErrorType,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import {
    Container,
    ConnectionState,
    Loader,
    ILoaderProps,
    waitContainerToCatchUp,
} from "@fluidframework/container-loader";
import {
    IDocumentServiceFactory,
} from "@fluidframework/driver-definitions";
import { MockDocumentDeltaConnection } from "@fluidframework/test-loader-utils";
import {
    LocalCodeLoader,
    TestObjectProvider,
    LoaderContainerTracker,
    TestContainerRuntimeFactory,
    ITestObjectProvider,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import {
    getDataStoreFactory,
    ITestDataObject,
    TestDataObjectType,
    describeNoCompat,
} from "@fluidframework/test-version-utils";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = {package: "test"};
// REVIEW: enable compat testing?
describeNoCompat("Container", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const loaderContainerTracker = new LoaderContainerTracker();
    before(function() {
        provider = getTestObjectProvider();

        // TODO: Convert these to mocked unit test. These are all API tests and doesn't
        // need the service.  For new disable the tests other than local driver
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });
    before(async ()=>{
        const loader = new Loader({
            logger: ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver.type } }),
            urlResolver: provider.urlResolver,
            documentServiceFactory:
                provider.documentServiceFactory,
            codeLoader: new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
        });
        loaderContainerTracker.add(loader);
        const container = await loader.createDetachedContainer(codeDetails);
        await container.attach(provider.driver.createCreateNewRequest("containerTest"));
    });
    afterEach(() => {
        loaderContainerTracker.reset();
    });
    async function loadContainer(props?: Partial<ILoaderProps>) {
        const loader = new Loader({
            ...props,
            logger: ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver.type } }),
            urlResolver: props?.urlResolver ?? provider.urlResolver,
            documentServiceFactory:
                props?.documentServiceFactory ?? provider.documentServiceFactory,
            codeLoader: props?.codeLoader ?? new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
        });
        loaderContainerTracker.add(loader);

        const testResolved = await loader.services.urlResolver.resolve(testRequest);
        ensureFluidResolvedUrl(testResolved);
        return Container.load(
            loader,
            {
                canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
                clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
                resolvedUrl: testResolved,
                version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
                loadMode: testRequest.headers?.[LoaderHeader.loadMode],
            },
        );
    }

    it("Load container successfully", async () => {
        const container = await loadContainer();
        assert.strictEqual(container.id, "containerTest", "Container's id should be set");
        assert.strictEqual(container.clientDetails.capabilities.interactive, true,
            "Client details should be set with interactive as true");
    });

    it("Load container unsuccessfully", async () => {
        let success: boolean = true;
        try {
            const documentServiceFactory = provider.documentServiceFactory;
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
            const documentServiceFactory = provider.documentServiceFactory;
            const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
            // Issue typescript-eslint/typescript-eslint #1256
            mockFactory.createDocumentService = async (resolvedUrl) => {
                const service = await documentServiceFactory.createDocumentService(resolvedUrl);
                // Issue typescript-eslint/typescript-eslint #1256
                // eslint-disable-next-line prefer-promise-reject-errors
                service.connectToDeltaStorage = async () => Promise.reject(false);
                return service;
            };
            const container2 = await loadContainer({ documentServiceFactory: mockFactory });
            await waitContainerToCatchUp(container2);
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
        const documentServiceFactory = provider.documentServiceFactory;
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
        const documentServiceFactory = provider.documentServiceFactory;
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
        const documentServiceFactory = provider.documentServiceFactory;
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
        const runtimeFactory = (_?: unknown) => new TestContainerRuntimeFactory(
            TestDataObjectType,
            getDataStoreFactory());

        const localTestObjectProvider = new TestObjectProvider(
            Loader,
            provider.driver,
            runtimeFactory);

        const container = await localTestObjectProvider.makeTestContainer() as Container;
        const dataObject = await requestFluidObject<ITestDataObject>(container, "default");

        let runCount = 0;

        dataObject._context.deltaManager.on("readonly", () => {
            runCount++;
        });

        container.forceReadonly(true);
        assert.strictEqual(container.readonly, true);

        assert.strictEqual(runCount, 1);
    });
});
