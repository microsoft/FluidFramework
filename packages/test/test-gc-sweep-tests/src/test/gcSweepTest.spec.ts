/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */
import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { ContainerErrorType } from "@fluidframework/container-definitions";
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
    testDataObjectWithEveryDDSFactory,
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

describeNoCompat("GC Sweep tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

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
        testDataObjectWithEveryDDSFactory,
        [
            [testDataObjectWithEveryDDSFactory.type, Promise.resolve(testDataObjectWithEveryDDSFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    const defaultSessionExpiryDurationMs = 3000; // 3 seconds

    // Enable config provider setting to write GC data at the root.
    const settings = {
        "Fluid.GarbageCollection.RunSessionExpiry": "true",
        "Fluid.GarbageCollection.TestOverride.SessionExpiryMs": defaultSessionExpiryDurationMs,
    };
    const configProvider = mockConfigProvider(settings);

    let overrideLogger: IgnoreErrorLogger;

    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const seed = 0.0604202162258638; // Math.random();
    const random: IRandom = makeRandom(seed);

    const randomInteger = (min: number, max: number): number => {
        return random.integer(min, max);
    };

    const testTime = 10 * 1000; // 1 minute

    // Currently for GC Sweep testing only, run with npm run test. Should not be running in CI
    // TODO: setup test to run in CI
    it(`GC Randomization Test with Seed: ${seed}`, async () => {
        provider = getTestObjectProvider({
            syncSummarizer: true,
        });
        overrideLogger = new IgnoreErrorLogger(provider.logger);
        provider.logger = overrideLogger;
        overrideLogger.ignoreExpectedEventTypes({
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: ContainerErrorType.clientSessionExpiredError,
        });

        const containerManager = new ContainerManager(runtimeFactory, configProvider, provider);
        const mainContainer = await containerManager.createContainer();
        const mainDataObject = await requestFluidObject<DataObjectManyDDSes>(mainContainer, "default");
        const testStart = Date.now();
        const handleTracker = new HandleTracker(testStart);
        const fluidObjectTracker = new FluidObjectTracker();
        fluidObjectTracker.trackDataObject(mainDataObject);

        const loadNewContainer = async () => {
            await containerManager.loadContainer();
        };
        const closeRandomContainer = async () => { containerManager.closeRandomContainer(random); };

        const referenceHandle = async (containerDataObjectManager: ContainerDataObjectManager, handle: IFluidHandle) => {
            const channelPath = fluidObjectTracker.getRandomHandleChannel(random);
            const parentDataObject = await containerDataObjectManager.getDataObject(channelPath.dataStoreId);
            const addedHandle = await parentDataObject.addHandleOpForChannel(channelPath.ddsId, handle, random);
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

        const createDataStoreForRandomContainer = async () => {
            const containerDataObjectManager = await containerManager.getRandomContainer(random);
            const dataObject = await containerDataObjectManager.createDataObject();
            await referenceHandle(containerDataObjectManager, dataObject.handle);
            fluidObjectTracker.trackDataObject(dataObject);
        };

        const referenceRandomHandle = async () => {
            const containerDataObjectManager = await containerManager.getRandomContainer(random);
            const handlePath = fluidObjectTracker.getRandomFluidObject(random);
            const handle = await containerDataObjectManager.getHandle(handlePath);
            await referenceHandle(containerDataObjectManager, handle);
        };

        const unreferenceRandomHandle = async () => {
            const containerDataObjectManager = await containerManager.getRandomContainer(random);
            const channelPath = handleTracker.getChannelWithHandle(random);
            const removedHandle = await containerDataObjectManager.removeHandle(channelPath, random);
            handleTracker.removeHandlePath({
                dataStoreId: channelPath.dataStoreId,
                ddsId: channelPath.ddsId,
                handleKey: removedHandle.key,
                handlePath: removedHandle.handle.absolutePath,
                actionNumber,
            });
        };

        const errorList: any[] = [];
        const actionsList: ITestAction[] = [];
        let actionNumber = 0;
        const actionStats = {
            loadNewContainer: 0,
            closeRandomContainer: 0,
            createDataStoreForRandomContainer: 0,
            referenceRandomHandle: 0,
            unreferenceRandomHandle: 0,
        };
        while (testStart + testTime > Date.now()) {
            actionNumber++;
            const availableActions: ITestAction[] = [];
            availableActions.push({ name: loadNewContainer.name, action: loadNewContainer, actionNumber });
            if (containerManager.hasConnectedContainers()) {
                availableActions.push({ name: closeRandomContainer.name, action: closeRandomContainer, actionNumber });
                availableActions.push({ name: createDataStoreForRandomContainer.name, action: createDataStoreForRandomContainer, actionNumber });
                availableActions.push({ name: referenceRandomHandle.name, action: referenceRandomHandle, actionNumber, add: handleTracker.addedPaths, remove: handleTracker.removablePaths });
                if (handleTracker.hasHandlePaths()) {
                    availableActions.push({ name: unreferenceRandomHandle.name, action: unreferenceRandomHandle, actionNumber, add: handleTracker.addedPaths, remove: handleTracker.removablePaths });
                }
            }

            const action: ITestAction = random.pick(availableActions);
            actionsList.push(action);

            if (actionNumber === 22) {
                console.log("test");
            }
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
            await sleep(randomInteger(0, 100));
        }
        const debugObject = {
            actionCount: actionsList.length,
            actionsList,
            errorCount: errorList.length,
            errorList,
            ...actionStats,
            handleRecord: handleTracker.handleActionRecord,
        };
        assert(errorList.length === 0, `Errors occurred!\nDebug: ${JSON.stringify(debugObject)}`);
        const minimumExpectedActions = 100;
        const minimumExpectedActionsPerActionType = minimumExpectedActions / 10;
        assert(actionsList.length > minimumExpectedActions, `Very few actions!\nDebug: ${JSON.stringify(debugObject)}`);
        Object.entries(actionStats).forEach(([name, stat]) => {
            assert(stat >= minimumExpectedActionsPerActionType, `There are less than ${minimumExpectedActionsPerActionType} calls to ${name}!`);
        });
    }).timeout(100 * 1000); // Add 40s of leeway

    // pick random runtime options (maybe a certain distribution as well)
    // pick random feature flags (maybe a certain distribution as well)
    // Assign random datastores and blobs
    // Make random edits -
    // Controlled summaries
});
