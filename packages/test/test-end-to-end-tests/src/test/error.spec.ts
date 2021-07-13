/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ILoggingError } from "@fluidframework/common-definitions";
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
    IThrottlingWarning,
    IUrlResolver,
} from "@fluidframework/driver-definitions";
import { createWriteError } from "@fluidframework/driver-utils";
import {
    createOdspNetworkError,
    invalidFileNameStatusCode,
} from "@fluidframework/odsp-doclib-utils";
import { OdspErrorType } from "@fluidframework/odsp-driver-definitions";
import { ChildLogger } from "@fluidframework/telemetry-utils";
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

    it("GeneralError Logging Test", async () => {
        const err = {
            userData: "My name is Mark",
            message: "Some message",
        };
        const iError = (CreateContainerError(err) as any) as ILoggingError;
        const props = iError.getTelemetryProperties();
        assert.equal(props.userData, undefined, "We shouldn't expose the properties of the inner/original error");
        assert.equal(props.message, err.message, "But name is copied over!");
    });

    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        if (err.getTelemetryProperties !== undefined) {
            assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
        }
        else {
            assert.fail("Error should support getTelemetryProperties()");
        }
    }

    it("GenericNetworkError Test_1", async () => {
        const networkError = createOdspNetworkError("Test Message", 500);
        assert.equal(networkError.errorType, DriverErrorType.genericNetworkError,
            "Error should be a genericNetworkError");
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.canRetry, true, "default is canRetry");
    });

    it("GenericNetworkError Test_2", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            400 /* statusCode */,
            undefined /* retryAfterSeconds */);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, false, "400 is non-retryable");
            assert.equal(networkError.statusCode, 400, "status code should be preserved");
        }
    });

    it("GenericNetworkError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            500 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== DriverErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, true, "500 is retryable");
        }
    });

    it("AuthorizationError Test 401", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            401 /* statusCode */);
        assert.equal(networkError.errorType, DriverErrorType.authorizationError,
            "Error should be an authorizationError");
        assertCustomPropertySupport(networkError);
    });

    it("AuthorizationError Test 403", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            403 /* statusCode */);
        if (networkError.errorType !== DriverErrorType.authorizationError) {
            assert.fail("Error should be an authorizationError");
        }
        else {
            assert.equal(networkError.errorType, DriverErrorType.authorizationError, "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("OutOfStorageError Test 507", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            507 /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.outOfStorageError,
            "Error should be an OutOfStorageError");
        assertCustomPropertySupport(networkError);
    });

    it("FileNotFoundOrAccessDeniedError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            404 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== DriverErrorType.fileNotFoundOrAccessDeniedError) {
            assert.fail("Error should be a fileNotFoundOrAccessDeniedError");
        }
        else {
            assert.equal(networkError.errorType, DriverErrorType.fileNotFoundOrAccessDeniedError,
                "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("InvalidFileNameError Test 414", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            414 /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("InvalidFileNameError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            invalidFileNameStatusCode /* statusCode */);
        assert.equal(networkError.errorType, OdspErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("ThrottlingError 400 Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            400 /* statusCode */,
            100 /* retryAfterSeconds */);
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.errorType, DriverErrorType.genericNetworkError, "Error should be a generic");
        assert.equal((networkError as any).retryAfterSeconds, undefined, "retryAfterSeconds should not be set");
    });

    it("ThrottlingError Test", async () => {
        const networkError = createOdspNetworkError(
            "Test Message",
            429,
            100 /* retryAfterSeconds */) as IThrottlingWarning;
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.errorType, DriverErrorType.throttlingError, "Error should be a throttlingError");
        assert.equal(networkError.retryAfterSeconds, 100, "retryAfterSeconds should be preserved");
    });

    it("WriteError Test", async () => {
        const writeError = createWriteError("Test Error");
        assertCustomPropertySupport(writeError);
        assert.equal(writeError.errorType, DriverErrorType.writeError, "Error should be a writeError");
        assert.equal(writeError.canRetry, false, "Error should be critical");
    });

    it("string test", async () => {
        const text = "Sample text";
        const writeError = CreateContainerError(text);
        assertCustomPropertySupport(writeError);
        assert.equal(writeError.errorType, DriverErrorType.genericError, "Error should be a writeError");
        assert.equal(writeError.message, text, "Text is preserved");
    });

    it("Check double conversion of network error", async () => {
        const networkError = createOdspNetworkError("Test Error", 400);
        const error1 = CreateContainerError(networkError);
        const error2 = CreateContainerError(error1);
        assertCustomPropertySupport(error1);
        assertCustomPropertySupport(error2);
        assert.deepEqual(error1, error2, "Both errors should be same!!");
    });

    it("Check double conversion of general error", async () => {
        const err = {
            message: "Test Error",
        };
        const error1 = CreateContainerError(err);
        const error2 = CreateContainerError(error1);
        assertCustomPropertySupport(error1);
        assertCustomPropertySupport(error2);
        assert.deepEqual(error1, error2, "Both errors should be same!!");
        assert.deepEqual(error2.message, err.message, "Message text should not be lost!!");
    });

    it("Check frozen error", async () => {
        const err = {
            message: "Test Error",
        };
        CreateContainerError(Object.freeze(err));
    });

    it("Preserve existing properties", async () => {
        const err1 = {
            errorType: "Something",
            message: "Test Error",
            canRetry: true,
        };
        const error1 = CreateContainerError(err1);
        const error2 = CreateContainerError(Object.freeze(error1));
        assert.equal(error1.errorType, err1.errorType, "Preserve errorType 1");
        assert.equal(error2.errorType, err1.errorType, "Preserve errorType 2");
    });
});
