/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
import { assert } from "console";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { IRequest } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    DefaultSummaryConfiguration,
    IContainerRuntimeOptions,
    ISummaryConfigurationHeuristics,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { delay } from "@fluidframework/common-utils";
import { mockConfigProvider } from "../mockConfigProvider";
import { IgnoreErrorLogger } from "../ignoreErrorLogger";
import { ContainerManager } from "../containerManager";
import { rootDataObjectWithChildDataObjectFactory } from "../dataObjectWithChildDataObject";
import { dataObjectWithCounterFactory } from "../dataObjectWithCounter";

describeNoCompat("GC InactiveObjectX tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    const summaryOptions = DefaultSummaryConfiguration as ISummaryConfigurationHeuristics;
    summaryOptions.summarizerClientElection = true;
    // Summaries should run automatically
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions,
        gcOptions: {
            gcAllowed: true,
        },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        rootDataObjectWithChildDataObjectFactory,
        [
            [rootDataObjectWithChildDataObjectFactory.type, Promise.resolve(rootDataObjectWithChildDataObjectFactory)],
            [dataObjectWithCounterFactory.type, Promise.resolve(dataObjectWithCounterFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    // const sessionExpiryDurationMs = 3000; // 3 seconds
    // TODO: create a config setup to allow for cohesive numbers
    // This value needs to be cohesive with a bunch of other values, for now it's hard coded
    const inactiveTimeoutMs = 10 * 1000; // 10 seconds

    // Set settings here, may be useful to put everything in the mockConfigProvider
    const settings = {
        // "Fluid.GarbageCollection.RunSessionExpiry": "true",
        "Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs": inactiveTimeoutMs,
        // "Fluid.GarbageCollection.TestOverride.SessionExpiryMs": sessionExpiryDurationMs,
    };
    const configProvider = mockConfigProvider(settings);

    let overrideLogger: IgnoreErrorLogger;

    // Test timeout
    const testTimeout = 5 * 60 * 1000; // 5 minutes

    // Currently for GC Sweep testing only, run with npm run test. Should not be running in CI
    // Note: can run with npm run test:build to build and run the test
    // TODO: have this configurable via mocha cmd arguments
    // TODO: setup test to run in CI
    const numberOfTestPasses = 1;
    for (let i = 0; i < numberOfTestPasses; i++) {
        const seed = Math.random();
        const liveContainers = 10;
        const random = makeRandom();
        it(`GC Ops Test with Seed: ${seed}, Containers: ${liveContainers}`, async () => {
            provider = getTestObjectProvider({
                syncSummarizer: true,
            });

            // Wrap the logger
            overrideLogger = new IgnoreErrorLogger(provider.logger);
            provider.logger = overrideLogger;

            // Create the containerManager responsible for retrieving, creating, loading, and tracking the lifetime of containers.
            const containerManager = new ContainerManager(runtimeFactory, configProvider, provider);
            await containerManager.createContainer();
            const testStart = Date.now();
            while (containerManager.connectedContainerCount < liveContainers) {
                await containerManager.loadContainer();
            }

            while (Date.now() - testStart < testTimeout) {
                if (containerManager.connectedContainerCount < liveContainers) {
                    await containerManager.loadContainer();
                } else {
                    containerManager.closeRandomContainer(random);
                }

                // This delay timeout is temporary until we decide a reasonable set of waits.
                await delay(inactiveTimeoutMs);
            }

            // Cleanup/Close all active containers.
            while (containerManager.hasConnectedContainers()) {
                containerManager.closeRandomContainer(random);
            }

            overrideLogger.logEvents(seed);
            assert(overrideLogger.inactiveObjectEvents.length === 0, `InactiveObject events occurred - look at nyc/testData-${seed}/inactiveObjectEvents.json`);
            assert(overrideLogger.errorEvents.length === 0, `Error events occurred - look at nyc/testData-${seed}/errorEvents.json`);
        }).timeout(testTimeout + 40 * 1000);
    }
});
