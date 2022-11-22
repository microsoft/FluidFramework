/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { benchmarkMemory } from "@fluid-tools/benchmark";
import { IRequest } from "@fluidframework/core-interfaces";
import {
    LoaderHeader,
    IFluidCodeDetails,
} from "@fluidframework/container-definitions";
import {
    Container,
    Loader,
    ILoaderProps,
} from "@fluidframework/container-loader";
import {
    LocalCodeLoader,
    LoaderContainerTracker,
    ITestObjectProvider,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { ensureFluidResolvedUrl } from "@fluidframework/driver-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

const id = "fluid-test://localhost/containerTest";
const testRequest: IRequest = { url: id };
const codeDetails: IFluidCodeDetails = { package: "test" };

// REVIEW: enable compat testing?
describeNoCompat("Container - memory usage benchmarks", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let loader: Loader;
    const loaderContainerTracker = new LoaderContainerTracker();

    function createLoader(props?: Partial<ILoaderProps>): Loader {
        return new Loader({
            ...props,
            logger: provider.logger,
            urlResolver: props?.urlResolver ?? provider.urlResolver,
            documentServiceFactory:
                props?.documentServiceFactory ?? provider.documentServiceFactory,
            codeLoader: props?.codeLoader ?? new LocalCodeLoader([[codeDetails, new TestFluidObjectFactory([])]]),
        });
    }

    before(function() {
        provider = getTestObjectProvider();

        // TODO: Convert these to mocked unit test. These are all API tests and doesn't
        // need the service.  For new disable the tests other than local driver
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });
    before(async () => {
        loader = createLoader();
        loaderContainerTracker.add(loader);
        const container = await loader.createDetachedContainer(codeDetails);
        await container.attach(provider.driver.createCreateNewRequest("containerTest"));
    });
    afterEach(() => {
        loaderContainerTracker.reset();
    });


    benchmarkMemory({
        title: "Create loader",
        benchmarkFn: async () => {
            createLoader();
        }
    });

    benchmarkMemory({
        title: "Create detached container",
        benchmarkFn: async () => {
            await loader.createDetachedContainer(codeDetails);
        }
    });

    benchmarkMemory({
        title: "Create detached container and attach it",
        benchmarkFn: async () => {
            const container = await loader.createDetachedContainer(codeDetails);
            await container.attach(provider.driver.createCreateNewRequest("containerTest"));
        }
    });

    benchmarkMemory({
        title: "Load existing container",
        benchmarkFn: async () => {
            const testResolved = await loader.services.urlResolver.resolve(testRequest);
            ensureFluidResolvedUrl(testResolved);
            const container = await Container.load(
                loader,
                {
                    canReconnect: testRequest.headers?.[LoaderHeader.reconnect],
                    clientDetailsOverride: testRequest.headers?.[LoaderHeader.clientDetails],
                    resolvedUrl: testResolved,
                    version: testRequest.headers?.[LoaderHeader.version] ?? undefined,
                    loadMode: testRequest.headers?.[LoaderHeader.loadMode],
                },
            );
            assert.strictEqual(container.clientDetails.capabilities.interactive, true,
                "Client details should be set with interactive as true");
        }
    });
});
