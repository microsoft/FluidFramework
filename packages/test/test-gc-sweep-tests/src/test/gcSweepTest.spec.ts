/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
import * as fs from "fs";
import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { makeRandom, IRandom } from "@fluid-internal/stochastic-test-utils";
import {
    DataObjectManyDDSes,
    dataObjectWithManyDDSesFactory,
} from "../testDataObjects";
import { mockConfigProvider } from "../mockConfigProvider";
import { IgnoreErrorLogger } from "../ignoreErrorLogger";
import { ContainerManager } from "../containerManager";
import { HandleTracker } from "../handlesTracker";
import { FluidObjectTracker } from "../fluidObjectTracker";
import { ContainerDataObjectManager } from "../containerDataObjectManager";

interface ITestAction {
    actionNumber: number;
    action: () => Promise<void>;
    name: string;
    [key: string]: any;
}

describeNoCompat.skip("GC Sweep tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    // Summaries should run automatically
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides: {
                state: "enabled",
                initialSummarizerDelayMs: 0,
                summarizerClientElection: true,
                maxAckWaitTime: 5000,
                maxOpsSinceLastSummary: 100,
                idleTime: 100,
                minIdleTime: 0,
                maxIdleTime: 300,
                maxTime: 4000,
                maxOps: 100,
                minOpsForLastSummaryAttempt: 1,
                runtimeOpWeight: 1,
                nonRuntimeOpWeight: 1,
            },
        },
        gcOptions: {
            gcAllowed: true,
        },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectWithManyDDSesFactory,
        [
            [dataObjectWithManyDDSesFactory.type, Promise.resolve(dataObjectWithManyDDSesFactory)],
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

    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Time spent to run the test. Currently 10 seconds, for better coverage increase this number.
    const testTime = 10 * 1000;

    // Currently for GC Sweep testing only, run with npm run test. Should not be running in CI
    // Note: can run with npm run test:build to build and run the test
    // TODO: have this configurable via mocha cmd arguments
    // TODO: setup test to run in CI
    const numberOfTests = 10;
    for (let i = 0; i < numberOfTests; i++) {
        const seed = Math.random();
        const random: IRandom = makeRandom(seed);
        it(`GC Randomization Test with Seed: ${seed}`, async () => {
            provider = getTestObjectProvider({
                syncSummarizer: true,
            });

            // Wrap the logger
            overrideLogger = new IgnoreErrorLogger(provider.logger);
            provider.logger = overrideLogger;

            // Create the containerManager responsible for retrieving, creating, loading, and tracking the lifetime of containers.
            const containerManager = new ContainerManager(runtimeFactory, configProvider, provider);
            const mainContainer = await containerManager.createContainer();
            const mainDataObject = await requestFluidObject<DataObjectManyDDSes>(mainContainer, "default");
            const testStart = Date.now();

            // Create the handle tracker which records when and where handles are stored on a global level
            // Must be updated manually - TODO make this automatic
            const handleTracker = new HandleTracker(testStart);

            // Create the fluidObjectTracker which records where all DataStores/DDSes are globally from the container runtime
            // Must be updated manually - TODO make this automatic
            const fluidObjectTracker = new FluidObjectTracker();
            fluidObjectTracker.trackDataObject(mainDataObject);

            // Note: may be worth it to pass in a context object to all the functions below
            // Needed objects are ContainerManager, HandleTracker, FluidObjectTracker
            // Create the random actions we will call in the test
            const loadNewContainer = async () => {
                await containerManager.loadContainer();
            };
            const closeRandomContainer = async () => { containerManager.closeRandomContainer(random); };

            const referenceHandle = async (containerDataObjectManager: ContainerDataObjectManager, handle: IFluidHandle) => {
                const channelPath = fluidObjectTracker.getRandomHandleChannel(random);
                const addedHandle = await containerDataObjectManager.addHandle(channelPath, handle, random);
                // Only track the handle after the handle has been added so that there aren't any race conditions
                // where a remove is called on a handle that hasn't been added
                handleTracker.addHandlePath({
                    dataStoreId: channelPath.dataStoreId,
                    ddsId: channelPath.ddsId,
                    handleKey: addedHandle.addedHandleKey,
                    handlePath: handle.absolutePath,
                    actionNumber,
                });
                if (addedHandle.removedHandle !== undefined) {
                    handleTracker.removeHandlePath({
                        dataStoreId: channelPath.dataStoreId,
                        ddsId: channelPath.ddsId,
                        handleKey: addedHandle.removedHandle.key,
                        handlePath: addedHandle.removedHandle.handle.absolutePath,
                        actionNumber,
                    });
                    handleTracker.removeRemovePath({
                        dataStoreId: channelPath.dataStoreId,
                        ddsId: channelPath.ddsId,
                    });
                }
            };

            // After creating the DataObject, the handle must be stored for it to become live.
            const createDataStoreForRandomContainer = async () => {
                const containerDataObjectManager = await containerManager.getRandomContainer(random);
                const dataObject = await containerDataObjectManager.createDataObject();
                await referenceHandle(containerDataObjectManager, dataObject.handle);
                fluidObjectTracker.trackDataObject(dataObject);
            };

            // Stores a handle of a DataStore or DDS into a DDS
            const referenceRandomHandle = async () => {
                const containerDataObjectManager = await containerManager.getRandomContainer(random);
                const handlePath = fluidObjectTracker.getRandomFluidObject(random);
                const handle = await containerDataObjectManager.getHandle(handlePath);
                await referenceHandle(containerDataObjectManager, handle);
            };

            // Removes a handle of a DataStore or DDS from a DDS
            const unreferenceRandomHandle = async () => {
                const containerDataObjectManager = await containerManager.getRandomContainer(random);
                // getChannelWithHandle only gets handles that aren't removed or getting removed
                const channelPath = handleTracker.getRemovePath(random);
                const removedHandle = await containerDataObjectManager.removeHandle(channelPath, random);

                // Only track the handle after the handle has been removed so that there aren't any race conditions
                // where a remove is called on a handle that has already been removed
                handleTracker.removeHandlePath({
                    dataStoreId: channelPath.dataStoreId,
                    ddsId: channelPath.ddsId,
                    handleKey: removedHandle.key,
                    handlePath: removedHandle.handle.absolutePath,
                    actionNumber,
                });
            };

            // Store any errors that have occurred in the errorList - feel free to print/examine this list
            const errorList: any[] = [];

            // Store all the actions ran in order in the actionList - feel free to print/examine this list
            const actionsList: ITestAction[] = [];

            // This stores the order of the actions
            let actionNumber = 0;

            // This is updated manually, we can get this after the test from querying the action list.
            const actionStats = {
                loadNewContainer: 0,
                closeRandomContainer: 0,
                createDataStoreForRandomContainer: 0,
                referenceRandomHandle: 0,
                unreferenceRandomHandle: 0,
            };

            while (testStart + testTime > Date.now()) {
                // Not all actions can be executed at random
                const availableActions: ITestAction[] = [];

                // Loading a new container is always possible
                availableActions.push({ name: loadNewContainer.name, action: loadNewContainer, actionNumber });

                // Connected Containers are required to close a container, create a DataStore, or reference a handle
                if (containerManager.hasConnectedContainers()) {
                    availableActions.push({ name: closeRandomContainer.name, action: closeRandomContainer, actionNumber });
                    availableActions.push({ name: createDataStoreForRandomContainer.name, action: createDataStoreForRandomContainer, actionNumber });
                    availableActions.push({ name: referenceRandomHandle.name, action: referenceRandomHandle, actionNumber, add: handleTracker.addedPaths, remove: handleTracker.removablePaths });

                    // Handles can only be removed if there are stored handles
                    if (handleTracker.hasHandlePaths()) {
                        availableActions.push({ name: unreferenceRandomHandle.name, action: unreferenceRandomHandle, actionNumber, add: handleTracker.addedPaths, remove: handleTracker.removablePaths });
                    }
                }

                // Pick a random action and start its execution. This is so actions can possibly run concurrently if the sleep timer is 0.
                const action: ITestAction = random.pick(availableActions);
                actionsList.push(action);
                action.action().catch((error: any) => {
                    const errorDebug = {
                        actionNumber: action.actionNumber,
                        action: action.name,
                        error,
                        message: error.message,
                        stack: error.stack,
                    };

                    errorList.push(errorDebug);
                });
                actionStats[action.name]++;
                /**
                 * This sleep needs to be improved to actually select from the important GC times
                 * - immediately
                 * - before summary
                 * - after summary
                 * - before cache Expiry
                 * - before inactive timeout
                 * - before sweep timeout
                 * - after sweep timeout
                 */
                await sleep(random.integer(0, 100));
                actionNumber++;
            }

            /**
             * At this point the test has finished, we might want to store a list of all the actions at this point and await them all to make sure they finish.
             * Feel free to put anything in the debug object. It's likely to get big. You can also put a range of actions if you're just trying to hone in on
             * what changed.
             *
             * This is the validation and data storage part of the test.
             */

            const stats = {
                ...actionStats,
                actionCount: actionsList.length,
                errorCount: errorList.length,
            };

            const runData = {
                stats,
                actions: actionsList,
                errors: errorList,
            };

            fs.mkdirSync(`nyc/testData-${seed}`, { recursive: true });
            fs.writeFileSync(`nyc/testData-${seed}/events.json`, JSON.stringify(overrideLogger.events));
            fs.writeFileSync(`nyc/testData-${seed}/inactiveObjectEvents.json`, JSON.stringify(overrideLogger.inactiveObjectEvents));
            fs.writeFileSync(`nyc/testData-${seed}/errorEvents.json`, JSON.stringify(overrideLogger.errorEvents));
            fs.writeFileSync(`nyc/testData-${seed}/errorEventStats.json`, JSON.stringify(overrideLogger.errorEventStats));
            fs.writeFileSync(`nyc/testData-${seed}/actions.json`, JSON.stringify(actionsList));
            fs.writeFileSync(`nyc/testData-${seed}/stats.json`, JSON.stringify(stats));
            fs.writeFileSync(`nyc/testData-${seed}/errors.json`, JSON.stringify(errorList));
            fs.writeFileSync(`nyc/testData-${seed}/runData.json`, JSON.stringify(runData));

            // Check that we don't have errors and print the debug object
            assert(errorList.length === 0, `${errorList.length} errors occurred! Check the nyc/testData-${seed}/errors.json`);

            // Check that we don't have any error logs
            assert(overrideLogger.errorEvents.length === 0, `${overrideLogger.errorEvents.length} error events have been logged! Check the nyc/testData-${seed}/errorEvents.json`);

            /**
             * This is just some heuristic expectations and validations
             * - expect some number of actions.
             * - expect some number of each action type.
             *
             * Feel free to improve these estimates.
             */
            const minimumExpectedActions = 100;
            const minimumExpectedActionsPerActionType = minimumExpectedActions / 10;
            assert(actionsList.length > minimumExpectedActions, `Very few actions!`);
            Object.entries(actionStats).forEach(([name, stat]) => {
                assert(stat >= minimumExpectedActionsPerActionType, `There are less than ${minimumExpectedActionsPerActionType} calls to ${name}!`);
            });
            // TODO: write the whole test to a file so that we can replicate it. For now, running the test with a particular seed will do.
        }).timeout(testTime + 40 * 1000); // Add 40s of leeway
    }

    // pick random runtime options (maybe a certain distribution as well) - features enabled should be the most up to date ones.
    // pick random feature flags (maybe a certain distribution as well)
    // Assign random datastores and blobs
    // Make random edits -
    // Controlled summaries
});
