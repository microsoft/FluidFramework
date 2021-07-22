/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerErrorType,
    LoaderHeader,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { CreateContainerError } from "@fluidframework/container-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IFluidResolvedUrl,
    IDocumentServiceFactory,
    DriverErrorType,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import {
    createOdspNetworkError,
} from "@fluidframework/odsp-doclib-utils";
import { ChildLogger, isILoggingError } from "@fluidframework/telemetry-utils";
import {
    createDocumentId,
    LocalCodeLoader,
    LoaderContainerTracker,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

// REVIEW: enable compat testing?
describeNoCompat("Errors Types", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let urlResolver: IUrlResolver;
    let testRequest: IRequest;
    let testResolved: IFluidResolvedUrl;
    let documentServiceFactory: IDocumentServiceFactory;
    let codeLoader: LocalCodeLoader;
    let loader: Loader;
    const loaderContainerTracker = new LoaderContainerTracker();
    before(() => {
        provider = getTestObjectProvider();
    });
    afterEach(() => {
        loaderContainerTracker.reset();
    });

    it("GeneralError Test", async () => {
        const id = createDocumentId();
        // Setup

        urlResolver = provider.urlResolver;
        testRequest = { url: await provider.driver.createContainerUrl(id) };
        testResolved =
            await urlResolver.resolve(testRequest) as IFluidResolvedUrl;
        documentServiceFactory = provider.documentServiceFactory;

        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            // eslint-disable-next-line prefer-promise-reject-errors
            service.connectToDeltaStream = async () => Promise.reject(false);
            return service;
        };

        codeLoader = new LocalCodeLoader([]);

        loader = new Loader({
            urlResolver,
            documentServiceFactory: mockFactory,
            codeLoader,
            logger: ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver.type } }),
        });
        loaderContainerTracker.add(loader);

        try {
            await Container.load(
                loader,
                {
                    canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
                    clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
                    resolvedUrl: testResolved,
                    version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
                    loadMode: testRequest.headers?.[LoaderHeader.loadMode],
                },
            );

            assert.fail("Error expected");
        } catch (error) {
            assert(
                [DriverErrorType.genericNetworkError, ContainerErrorType.genericError].includes(error.errorType),
                `${error.errorType} should be genericError or genericNetworkError`,
            );
        }
    });

    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        assert(isILoggingError(err), "Error should support getTelemetryProperties()");
        assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
    }

    it("Check double conversion of network error", async () => {
        const networkError = createOdspNetworkError("Test Error", 400);
        const error1 = CreateContainerError(networkError);
        const error2 = CreateContainerError(error1);
        assertCustomPropertySupport(error1);
        assertCustomPropertySupport(error2);
        assert.deepEqual(networkError, error1, "networkError, error1 should be the same!");
        assert.deepEqual(error1, error2, "error1, error2 should be the same!");
    });
});
