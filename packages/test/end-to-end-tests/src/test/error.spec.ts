/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerErrorType,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { CreateContainerError } from "@fluidframework/container-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    IFluidResolvedUrl,
    IDocumentServiceFactory,
    DriverErrorType,
    IThrottlingWarning,
} from "@fluidframework/driver-definitions";
import { createWriteError } from "@fluidframework/driver-utils";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import {
    createOdspNetworkError,
    invalidFileNameStatusCode,
    OdspErrorType,
} from "@fluidframework/odsp-doclib-utils";
import { CustomErrorWithProps } from "@fluidframework/telemetry-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { LocalCodeLoader } from "@fluidframework/test-utils";

describe("Errors Types", () => {
    const id = "fluid-test://localhost/errorTest";
    const testRequest: IRequest = { url: id };

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: LocalResolver;
    let testResolved: IFluidResolvedUrl;
    let documentServiceFactory: IDocumentServiceFactory;
    let codeLoader: LocalCodeLoader;
    let loader: Loader;

    it("GeneralError Test", async () => {
        // Setup
        testDeltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();
        testResolved = await urlResolver.resolve(testRequest) as IFluidResolvedUrl;
        documentServiceFactory = new LocalDocumentServiceFactory(testDeltaConnectionServer);

        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            // eslint-disable-next-line prefer-promise-reject-errors
            service.connectToDeltaStorage = async () => Promise.reject(false);
            return service;
        };

        codeLoader = new LocalCodeLoader([]);

        loader = new Loader({
            urlResolver,
            documentServiceFactory: mockFactory,
            codeLoader,
        });

        try {
            await Container.load(
                "tenantId/documentId",
                loader,
                testRequest,
                testResolved);

            assert.fail("Error expected");
        } catch (error) {
            assert.equal(error.errorType, ContainerErrorType.genericError, "Error should be a genericError");
        }

        await testDeltaConnectionServer.webSocketServer.close();
    });

    it("GeneralError Logging Test", async () => {
        const err = {
            userData: "My name is Mark",
            message: "Some message",
        };
        const iError = (CreateContainerError(err) as any) as CustomErrorWithProps;
        const props = iError.getCustomProperties();
        assert.equal(props.userData, undefined, "We shouldn't expose the properties of the inner/original error");
        assert.equal(props.message, err.message, "But name is copied over!");
    });

    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        if (err.getCustomProperties !== undefined) {
            assert.equal(err.getCustomProperties().asdf, "asdf", "Error should have property asdf");
        }
        else {
            assert.fail("Error should support getCustomProperties()");
        }
    }

    it("GenericNetworkError Test_1", async () => {
        const networkError = createOdspNetworkError("Test Message");
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
            undefined,
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
        const networkError = createOdspNetworkError("Test Error");
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
