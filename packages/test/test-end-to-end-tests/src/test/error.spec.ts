/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { Container, ILoaderProps, Loader } from "@fluidframework/container-loader";
import { IDocumentServiceFactory} from "@fluidframework/driver-definitions";
import { createOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import { isILoggingError, normalizeError } from "@fluidframework/telemetry-utils";
import {
    LocalCodeLoader,
    LoaderContainerTracker,
    ITestObjectProvider,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";

// REVIEW: enable compat testing?
describeNoCompat("Errors Types", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let fileName: string;
    const loaderContainerTracker = new LoaderContainerTracker();
    before(() => {
        provider = getTestObjectProvider();
    });

    beforeEach(async () => {
        const loader = new Loader({
            logger: provider.logger,
            urlResolver: provider.urlResolver,
            documentServiceFactory:
                provider.documentServiceFactory,
            codeLoader: new LocalCodeLoader([[provider.defaultCodeDetails, new TestFluidObjectFactory([])]]),
        });
        fileName = uuid();
        loaderContainerTracker.add(loader);
        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
        await container.attach(provider.driver.createCreateNewRequest(fileName));
    });

    afterEach(() => {
        loaderContainerTracker.reset();
    });

    async function loadContainer(props?: Partial<ILoaderProps>) {
        const loader = new Loader({
            ...props,
            logger: provider.logger,
            urlResolver: props?.urlResolver ?? provider.urlResolver,
            documentServiceFactory:
                props?.documentServiceFactory ?? provider.documentServiceFactory,
            codeLoader: props?.codeLoader ??
                new LocalCodeLoader([[provider.defaultCodeDetails, new TestFluidObjectFactory([])]]),
        });
        loaderContainerTracker.add(loader);
        const requestUrl = await provider.driver.createContainerUrl(fileName);
        const testResolved = await loader.services.urlResolver.resolve({ url: requestUrl });
        ensureFluidResolvedUrl(testResolved);
        return Container.load(
            loader,
            {
                resolvedUrl: testResolved,
                version: undefined,
            },
        );
    }

    itExpects("GeneralError Test",
    [
        {eventName: "fluid:telemetry:Container:ContainerClose", error: ""},
        {eventName: "TestException", errorType: ContainerErrorType.genericError},
    ],
    async () => {
        const documentServiceFactory = provider.documentServiceFactory;
        const mockFactory = Object.create(documentServiceFactory) as IDocumentServiceFactory;
        mockFactory.createDocumentService = async (resolvedUrl) => {
            const service = await documentServiceFactory.createDocumentService(resolvedUrl);
            service.connectToDeltaStream = async () => { throw new Error(); };
            return service;
        };
        await loadContainer({ documentServiceFactory: mockFactory });
    });

    function assertCustomPropertySupport(err: any) {
        err.asdf = "asdf";
        assert(isILoggingError(err), "Error should support getTelemetryProperties()");
        assert.equal(err.getTelemetryProperties().asdf, "asdf", "Error should have property asdf");
    }

    it("Check double conversion of network error", async () => {
        const networkError = createOdspNetworkError("Test Error", 400);
        const error1 = normalizeError(networkError);
        const error2 = normalizeError(error1);
        assertCustomPropertySupport(error1);
        assertCustomPropertySupport(error2);
        assert.deepEqual(networkError, error1, "networkError, error1 should be the same!");
        assert.deepEqual(error1, error2, "error1, error2 should be the same!");
    });
});
