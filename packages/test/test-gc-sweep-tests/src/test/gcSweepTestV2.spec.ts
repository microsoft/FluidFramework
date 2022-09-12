/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
import * as fs from "fs";
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
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { makeRandom, IRandom } from "@fluid-internal/stochastic-test-utils";
import { delay } from "@fluidframework/common-utils";
import { mockConfigProvider } from "../mockConfigProvider";
import { IgnoreErrorLogger } from "../ignoreErrorLogger";
import { ContainerManager } from "../containerManager";
import { opSendingDataObjectFactory, ReferencingDataObject, referencingDataObjectFactory } from "../treeDataObject";

describeNoCompat("GC Sweep tests", (getTestObjectProvider) => {
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
        referencingDataObjectFactory,
        [
            [referencingDataObjectFactory.type, Promise.resolve(referencingDataObjectFactory)],
            [opSendingDataObjectFactory.type, Promise.resolve(opSendingDataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    // const sessionExpiryDurationMs = 3000; // 3 seconds
    const inactiveTimeoutMs = 3000; // 3 seconds

    // Set settings here, may be useful to put everything in the mockConfigProvider
    const settings = {
        // "Fluid.GarbageCollection.RunSessionExpiry": "true",
        "Fluid.GarbageCollection.TestOverride.InactiveTimeoutMs": inactiveTimeoutMs,
        // "Fluid.GarbageCollection.TestOverride.SessionExpiryMs": sessionExpiryDurationMs,
    };
    const configProvider = mockConfigProvider(settings);

    let overrideLogger: IgnoreErrorLogger;

    // Test timeout
    const testTimeout = 5 * 60 * 60 * 1000; // 5 hours

    // Currently for GC Sweep testing only, run with npm run test. Should not be running in CI
    // Note: can run with npm run test:build to build and run the test
    // TODO: have this configurable via mocha cmd arguments
    // TODO: setup test to run in CI
    const numberOfTests = 1;
    for (let i = 0; i < numberOfTests; i++) {
        const seed = Math.random();
        const random: IRandom = makeRandom(seed);

        const liveContainers = 10;
        const dataStoresInTree = 2;
        const opsPerDataStorePerContainer = 500;
        const opLimit = 200000;
        const burstsTotal = opLimit / (liveContainers * dataStoresInTree * opsPerDataStorePerContainer);

        it(`GC Ops Test with Seed: ${seed}, Containers: ${liveContainers}, Ops/DataStore/Container: ${opsPerDataStorePerContainer}, Ops Total: ${opLimit}, Bursts: ${burstsTotal}`, async () => {
            provider = getTestObjectProvider({
                syncSummarizer: true,
            });

            // Wrap the logger
            overrideLogger = new IgnoreErrorLogger(provider.logger);
            provider.logger = overrideLogger;

            // Create the containerManager responsible for retrieving, creating, loading, and tracking the lifetime of containers.
            const containerManager = new ContainerManager(runtimeFactory, configProvider, provider);
            const mainContainer = await containerManager.createContainer();
            const mainDataObject = await requestFluidObject<ReferencingDataObject>(mainContainer, "default");
            mainDataObject.start(opsPerDataStorePerContainer, random);
            // waits needs to be > 100
            const waitsMs: number[] = [
                inactiveTimeoutMs,
                0,
                summaryOptions.maxIdleTime,
                summaryOptions.maxTime,
                summaryOptions.maxAckWaitTime,
            ];

            // Ops per interesting gc event per client
            // ops per interesting gc event
            // ops per person
            let bursts = 0;
            while (bursts < burstsTotal) {
                if (containerManager.connectedContainerCount < liveContainers) {
                    const container = await containerManager.loadContainer();
                    const rootDataObject = await requestFluidObject<ReferencingDataObject>(container, "default");
                    rootDataObject.start(opsPerDataStorePerContainer, random);
                } else {
                    containerManager.closeRandomContainer(random);
                }
                const wait = random.pick(waitsMs);
                await delay(wait);
                bursts++;
            }

            fs.mkdirSync(`nyc/testData-${seed}`, { recursive: true });
            fs.writeFileSync(`nyc/testData-${seed}/events.json`, JSON.stringify(overrideLogger.events));
            fs.writeFileSync(`nyc/testData-${seed}/inactiveObjectEvents.json`, JSON.stringify(overrideLogger.inactiveObjectEvents));
            fs.writeFileSync(`nyc/testData-${seed}/errorEvents.json`, JSON.stringify(overrideLogger.errorEvents));
            fs.writeFileSync(`nyc/testData-${seed}/errorEventStats.json`, JSON.stringify(overrideLogger.errorEventStats));

            const finalContainer = await containerManager.loadContainer();
            const finalDataObject = await requestFluidObject<ReferencingDataObject>(finalContainer, "default");
            const finalCounter = await finalDataObject.counterHandle.get();
            const finalCount = finalCounter.value;
            assert(finalCount === opLimit / dataStoresInTree, `Expected final count of ${finalCount} to be ${opLimit / dataStoresInTree}`);

            assert(overrideLogger.inactiveObjectEvents.length === 0, `InactiveObject events occurred - look at nyc/testData-${seed}/inactiveObjectEvents.json`);
            assert(overrideLogger.errorEvents.length === 0, `Error events occurred - look at nyc/testData-${seed}/errorEvents.json`);
        }).timeout(testTimeout);
    }
});
