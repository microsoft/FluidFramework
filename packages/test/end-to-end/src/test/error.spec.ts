/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IRequest } from "@microsoft/fluid-component-core-interfaces";
import {
    ErrorType,
    IThrottlingWarning,
    IProxyLoaderFactory,
} from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import {
    IFluidResolvedUrl,
    IDocumentServiceFactory,
} from "@microsoft/fluid-driver-definitions";
import {
    CreateContainerError,
    createNetworkError,
    createWriteError,
    ErrorWithProps,
    invalidFileNameErrorCode,
} from "@microsoft/fluid-driver-utils";
import { TestDocumentServiceFactory, TestResolver } from "@microsoft/fluid-local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { LocalCodeLoader } from "@microsoft/fluid-test-utils";

describe("Errors Types", () => {
    const id = "fluid-test://localhost/errorTest";
    const testRequest: IRequest = { url: id };

    let testDeltaConnectionServer: ILocalDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
    let serviceFactory: IDocumentServiceFactory;
    let codeLoader: LocalCodeLoader;
    let loader: Loader;

    it("GeneralError Test", async () => {
        // Setup
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
            new Map<string, IProxyLoaderFactory>());

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
            assert.equal(error.errorType, ErrorType.genericError, "Error should be a genericError");
        }
    });

    it("GeneralError Logging Test", async () => {
        const err = {
            userData: "My name is Mark",
            message: "Some message",
        };
        const iError = (CreateContainerError(err) as any) as ErrorWithProps;
        const props = iError.getCustomProperties() as any;
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
        const networkError = createNetworkError("Test Message", false /* canRetry */);
        assert.equal(networkError.errorType, ErrorType.genericNetworkError,
            "Error should be a genericNetworkError");
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.canRetry, false, "canRetry should be preserved");
    });

    it("GenericNetworkError Test_2", async () => {
        const networkError = createNetworkError(
            "Test Message",
            true /* canRetry */,
            400 /* statusCode */,
            undefined /* retryAfterSeconds */);
        if (networkError.errorType !== ErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, true, "canRetry should be preserved");
            assert.equal(networkError.statusCode, 400, "status code should be preserved");
        }
    });

    it("GenericNetworkError Test", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            500 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== ErrorType.genericNetworkError) {
            assert.fail("Error should be a genericNetworkError");
        }
        else {
            assert.equal(networkError.canRetry, false, "Error should be critical");
        }
    });

    it("AuthorizationError Test 401", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            401 /* statusCode */);
        assert.equal(networkError.errorType, ErrorType.authorizationError,
            "Error should be an authorizationError");
        assertCustomPropertySupport(networkError);
    });

    it("AuthorizationError Test 403", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            403 /* statusCode */);
        if (networkError.errorType !== ErrorType.authorizationError) {
            assert.fail("Error should be an authorizationError");
        }
        else {
            assert.equal(networkError.errorType, ErrorType.authorizationError, "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("OutOfStorageError Test 507", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            507 /* statusCode */);
        assert.equal(networkError.errorType, ErrorType.outOfStorageError,
            "Error should be an OutOfStorageError");
        assertCustomPropertySupport(networkError);
    });

    it("FileNotFoundOrAccessDeniedError Test", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            404 /* statusCode */);
        assertCustomPropertySupport(networkError);
        if (networkError.errorType !== ErrorType.fileNotFoundOrAccessDeniedError) {
            assert.fail("Error should be a fileNotFoundOrAccessDeniedError");
        }
        else {
            assert.equal(networkError.errorType, ErrorType.fileNotFoundOrAccessDeniedError,
                "canRetry should be preserved");
            assert.equal(networkError.canRetry, false, "canRetry should be preserved");
        }
    });

    it("InvalidFileNameError Test 414", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            414 /* statusCode */);
        assert.equal(networkError.errorType, ErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("InvalidFileNameError Test", async () => {
        const networkError = createNetworkError(
            "Test Message",
            false /* canRetry */,
            invalidFileNameErrorCode /* statusCode */);
        assert.equal(networkError.errorType, ErrorType.invalidFileNameError,
            "Error should be an InvalidFileNameError");
        assertCustomPropertySupport(networkError);
    });

    it("ThrottlingError Test", async () => {
        const networkError = createNetworkError(
            "Test Message",
            true /* canRetry */,
            400 /* statusCode */,
            100 /* retryAfterSeconds */) as IThrottlingWarning;
        assertCustomPropertySupport(networkError);
        assert.equal(networkError.errorType, ErrorType.throttlingError, "Error should be a throttlingError");
        assert.equal(networkError.retryAfterSeconds, 100, "retryAfterSeconds should be preserved");
    });

    it("WriteError Test", async () => {
        const writeError = createWriteError("Test Error");
        assertCustomPropertySupport(writeError);
        assert.equal(writeError.errorType, ErrorType.writeError, "Error should be a writeError");
        assert.equal(writeError.canRetry, false, "Error should be critical");
    });

    it("string test", async () => {
        const text = "Sample text";
        const writeError = CreateContainerError(text);
        assertCustomPropertySupport(writeError);
        assert.equal(writeError.errorType, ErrorType.genericError, "Error should be a writeError");
        assert.equal(writeError.message, text, "Text is preserved");
        assert.equal(writeError.canRetry, false, "Error should be critical");
    });

    it("Check double conversion of network error", async () => {
        const networkError = createNetworkError("Test Error", true /* canRetry */);
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
        const error1 = CreateContainerError(err);
        const error2 = CreateContainerError(Object.freeze(err));
        assert.equal(error1.canRetry, false, "Can retry false 1.");
        assert.equal(error2.canRetry, false, "Can retry false 2");
    });

    it("Preserve existing properties", async () => {
        const err1 = {
            errorType: "Something",
            message: "Test Error",
            canRetry: true,
        };
        const error1 = CreateContainerError(err1);
        const error2 = CreateContainerError(Object.freeze(error1));
        assert.equal(error1.canRetry, true, "Preserve canRetry 1");
        assert.equal(error2.canRetry, true, "Preserve canRetry 2");
        assert.equal(error1.errorType, err1.errorType, "Preserve errorType 1");
        assert.equal(error2.errorType, err1.errorType, "Preserve errorType 2");
    });

    it("Overwrite canRetry", async () => {
        const err1 = {
            message: "Test Error",
            canRetry: true,
        };
        const error1 = CreateContainerError(err1, false);
        assert.equal(error1.canRetry, false, "canRetry 1");

        const err2 = {
            message: "Test Error",
            canRetry: false,
        };
        const error2 = CreateContainerError(err2, true);
        assert.equal(error2.canRetry, true, "canRetry 2");
    });
});
