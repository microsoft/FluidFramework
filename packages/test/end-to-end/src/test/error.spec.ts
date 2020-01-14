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
    IFluidResolvedUrl,
    ErrorType,
} from "@microsoft/fluid-driver-definitions";
import {
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-test-server";
import { createErrorObject } from "@microsoft/fluid-driver-base";
import { errorObjectFromOdspError } from "@microsoft/fluid-odsp-driver";
import { createIError } from "@microsoft/fluid-driver-utils";
import * as assert from "assert";

describe("Errors Types", () => {
    let testDeltaConnectionServer: ITestDeltaConnectionServer;
    let testResolver: TestResolver;
    let testResolved: IFluidResolvedUrl;
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

    it("General Error Test", async () => {
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
            assert.equal(error.errorType, ErrorType.generalError, "Error is not a general error");
        }
    });

    it("Network Error Test_1", async () => {
        const err = {
            message: "Test Error",
        }
        const networkError = createIError(createErrorObject("handler", err, false));
        assert.equal(networkError.errorType, ErrorType.connectionError, "Error is not a network error");
    });

    it("Network Error Test_2", async () => {
        const err = {
            message: "Test Error",
            retryAfter: 100,
        }
        const networkError = createIError(createErrorObject("handler", err, false));
        assert.equal(networkError.errorType, ErrorType.connectionError, "Error is not a network error");
    });

    
    it("Network Error Test_3", async () => {
        const err = {
            message: "Test Error",
            code: 400,
        }
        const networkError = createIError(errorObjectFromOdspError(err, false));
        assert.equal(networkError.errorType, ErrorType.connectionError, "Error is not a network error");
    });

    it("Throttling Error Test", async () => {
        const err = {
            message: "Test Error",
            code: 529,
            retryAfter: 100,
        }
        const throttlingError = createIError(errorObjectFromOdspError(err, true));
        assert.equal(throttlingError.errorType, ErrorType.throttlingError, "Error is not a throttling error");
    });

    it("Check double conversion of network error", async () => {
        const err = {
            message: "Test Error",
            code: 529,
            retryAfter: 100,
        }
        const error1 = createIError(errorObjectFromOdspError(err, true), true);                                                                                                                                                                              
        const error2 = createIError(error1, false);
        assert.equal(error1, error2, "Both errors should be same!!");
    });

    it("Check double conversion of general error", async () => {
        const err = {
            message: "Test Error",
        }
        const error1 = createIError(err, false);
        const error2 = createIError(error1, true);
        assert.equal(error1, error2, "Both errors should be same!!");
    });

    it("Check frozen error", async () => {
        const err = {
            message: "Test Error",
        }
        const error1 = createIError(err, false);
        const error2 = createIError(Object.freeze(err), false);
        assert.equal((error2 as any).critical, undefined, "Error should not contain critical property.");
        assert.equal((error1 as any).critical, false, "Error should contain critical property.");
    });

});
