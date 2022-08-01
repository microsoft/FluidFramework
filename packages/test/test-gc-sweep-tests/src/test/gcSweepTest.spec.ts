/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { ContainerErrorType, IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle, IFluidRouter, IRequest } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import Random from "random-js";
import {
    DataObjectManyDDSes,
    testDataObjectWithEveryDDSFactory,
} from "../testDataObjects";
import { mockConfigProvider } from "../mockConfigProvider";
import { IgnoreErrorLogger } from "../ignoreErrorLogger";

enum ReferenceState {
    Unreferenced,
    Referenced,
    Root,
}

class TestNode {
    public readonly parents: string[] = [];
    public readonly children: string[] = [];
    public referenceState: ReferenceState;
    constructor(public readonly id: string, referenceState = ReferenceState.Unreferenced) {
        this.referenceState = referenceState;
    }

    public deleteChild(id: string) {
        const deleteId = this.children.indexOf(id);
        this.children.splice(deleteId, 1);
    }

    public deleteParent(id: string) {
        const deleteId = this.parents.indexOf(id);
        this.parents.splice(deleteId, 1);
    }
}

describeNoCompat("GC Random tests", (getTestObjectProvider) => {
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

    let mainContainer: IContainer;
    let connectedContainers: IContainer[];
    let closedContainers: IContainer[];
    let testNodes: Map<string, TestNode>;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };
    const loadContainer = async (): Promise<IContainer> => {
        return provider.loadContainer(runtimeFactory, { configProvider });
    };

    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const seed = Math.random();
    const random: Random = makeRandom(seed);

    const randomInteger = (min: number, max: number): number => {
        return random.integer(min, max);
    };

    const loadNewContainer = async () => {
        const newContainer = await loadContainer();
        newContainer.on("closed", () => {
            const index = connectedContainers.indexOf(newContainer);
            assert(index >= 0, "Expected container to have been added to connectedContainers");
            closedContainers.push(connectedContainers[index]);
            connectedContainers.splice(index, 1);
        });
        connectedContainers.push(newContainer);
    };

    const closeRandomContainer = async () => {
        if (connectedContainers.length <= 0) {
            return;
        }
        random.pick(connectedContainers).close();
    };

    const requestDataStore = async (router: IFluidRouter, route: string) => {
        const dataStore = await requestFluidObject<DataObjectManyDDSes>(router, route);
        dataStore.setRandom(random);
        return dataStore;
    };

    const createDataStoreForContainer = async (
        container: IContainer,
        dataStoreType: string = DataObjectManyDDSes.type,
    ) => {
        const defaultDataStore = await requestDataStore(container, "default");
        const newDataStore = await defaultDataStore.containerRuntime.createDataStore(dataStoreType);
        const newDataObject = await requestDataStore(newDataStore, "");
        testNodes.set(newDataObject.id, new TestNode(newDataObject.id));
        return newDataObject;
    };

    const createDataStoreForRandomContainer = async () => {
        if (connectedContainers.length <= 0) {
            return;
        }
        await createDataStoreForContainer(getRandomContainer());
    };

    const getTestNode = (id: string): TestNode => {
        const testNode = testNodes.get(id);
        assert(testNode !== undefined, `Datastore ${id} not found in TestNode map!`);
        return testNode;
    };

    const trackDataStoreAsReferenced = (id: string) => {
        const testNode = getTestNode(id);
        if (testNode.referenceState === ReferenceState.Unreferenced) {
            testNode.referenceState = ReferenceState.Referenced;
            for (const childId of testNode.children) {
                trackDataStoreAsReferenced(childId);
            }
        }
    };

    const hasReferencedParent = (id: string): boolean => {
        for (const parentNodeId of getTestNode(id).parents) {
            const parentNode = getTestNode(parentNodeId);
            if (parentNode.referenceState !== ReferenceState.Unreferenced) {
                return true;
            }
        }
        return false;
    };

    const updateUnreferencedDataStores = (id: string) => {
        const testNode = getTestNode(id);
        if (testNode.referenceState === ReferenceState.Referenced && !hasReferencedParent(id)) {
            testNode.referenceState = ReferenceState.Unreferenced;
            for (const childId of testNode.children) {
                updateUnreferencedDataStores(childId);
            }
        }
    };

    const referenceDataStore = async (dataStore: DataObjectManyDDSes, parentDataStore: DataObjectManyDDSes) => {
        const handle = await parentDataStore.generateAddHandleOp(dataStore.handle);
        if (handle !== undefined) {
            if (handle.absolutePath === dataStore.handle.absolutePath) {
                return;
            }
            await unreferenceDataStoreFromHandle(handle, parentDataStore);
        }
        const parentNode = getTestNode(parentDataStore.id);
        parentNode.children.push(dataStore.id);
        getTestNode(dataStore.id).parents.push(parentDataStore.id);
        if (parentNode.referenceState !== ReferenceState.Unreferenced) {
            trackDataStoreAsReferenced(dataStore.id);
        }
    };

    const unreferenceDataStore = (dataStore: DataObjectManyDDSes, parentDataStore: DataObjectManyDDSes) => {
        getTestNode(parentDataStore.id).deleteChild(dataStore.id);
        getTestNode(dataStore.id).deleteParent(parentDataStore.id);
        updateUnreferencedDataStores(dataStore.id);
    };

    const getRandomContainer = (): IContainer => {
        return random.pick(connectedContainers);
    };

    const getRandomDataStoreFromContainer = async (container: IContainer) => {
        const testNode = random.pick(Array.from(testNodes.values())); // where test nodes have a reference
        return requestDataStore(container, testNode.id);
    };

    const referenceRandomDataStore = async () => {
        if (connectedContainers.length <= 0 || testNodes.size <= 0) {
            return;
        }
        const container = getRandomContainer();
        const dataStore = await getRandomDataStoreFromContainer(container);
        const parent = await getRandomDataStoreFromContainer(container);
        await referenceDataStore(dataStore, parent);
    };

    const unreferenceRandomDataStore = async () => {
        if (connectedContainers.length <= 0 || testNodes.size <= 0) {
            return;
        }
        const container = getRandomContainer();
        const dataStore = await getRandomDataStoreFromContainer(container);
        const handle = await dataStore.generateRemoveHandleOp();
        if (handle !== undefined) {
            await unreferenceDataStoreFromHandle(handle, dataStore);
        }
    };

    const unreferenceDataStoreFromHandle = async (handle: IFluidHandle, dataStore: DataObjectManyDDSes) => {
        const childObject = await handle.get();
        if (childObject instanceof DataObjectManyDDSes) {
            unreferenceDataStore(childObject, dataStore);
        } else {
            throw new Error(`Got a IFluidHandle to a typeof ${typeof childObject}`);
        }
    };

    const actionsList: (() => Promise<void>)[] = [
        loadNewContainer,
        closeRandomContainer,
        createDataStoreForRandomContainer,
        referenceRandomDataStore,
        unreferenceRandomDataStore,
    ];
    const testTime = 60 * 1000; // 1 minute
    let sleptTime = 0;
    const plannedActions: { action: (() => Promise<void>); sleepTime: number; }[] = [];
    while (sleptTime < testTime) {
        const sleepTime: number = randomInteger(0, 100);
        const action = random.pick(actionsList);
        plannedActions.push({ action, sleepTime });
        sleptTime += sleepTime;
    }

    let plannedActionsString: string = "";
    for (const action of plannedActions) {
        plannedActionsString += `action: ${action.action.name}, sleepTime: ${action.sleepTime}\n`;
    }

    it.skip(`Planned Actions:\n${plannedActionsString}\nSeed: ${seed}`, async () => {
        provider = getTestObjectProvider({
            syncSummarizer: true,
        });
        overrideLogger = new IgnoreErrorLogger(provider.logger);
        provider.logger = overrideLogger;
        overrideLogger.ignoreExpectedEventTypes({
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: ContainerErrorType.clientSessionExpiredError,
        });

        // Create a Container for the first client.
        mainContainer = await createContainer();
        const mainDataStore = await requestFluidObject<DataObjectManyDDSes>(mainContainer, "default");
        connectedContainers = [];
        closedContainers = [];
        testNodes = new Map();
        testNodes.set(mainDataStore.id, new TestNode(mainDataStore.id, ReferenceState.Root));

        const errorList: any[] = [];
        for (const plannedAction of plannedActions) {
            plannedAction.action().catch((error) => {
                errorList.push(error);
            });
            await sleep(plannedAction.sleepTime);
        }
        assert(errorList.length === 0, `${errorList}`);
    }).timeout(100 * 1000); // Add 40s of leeway

    // pick random runtime options (maybe a certain distribution as well)
    // pick random feature flags (maybe a certain distribution as well)
    // Assign random datastores and blobs
    // Make random edits -
    // Controlled summaries
});
