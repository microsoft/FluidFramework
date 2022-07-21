/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { ContainerErrorType, IContainer } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { EventAndErrorTrackingLogger, ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ITelemetryBaseEvent, ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { TestDataObject } from "../testDataObjects";
import { mockConfigProvider } from "../mockConfigProvider";

enum ReferenceState {
    Unreferenced,
    Referenced,
    Root,
}

class TestNode {
    public readonly parents: Set<string> = new Set();
    public readonly children: Set<string> = new Set();
    public referenceState: ReferenceState;
    constructor(public readonly id: string, referenceState = ReferenceState.Unreferenced) {
        this.referenceState = referenceState;
    }
}

class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    private readonly ignoredEvents: Map<string, ITelemetryGenericEvent> = new Map();

    public ignoreExpectedEventTypes(... anyIgnoredEvents: ITelemetryGenericEvent[]) {
        for (const event of anyIgnoredEvents) {
            this.ignoredEvents.set(event.eventName, event);
        }
    }

    send(event: ITelemetryBaseEvent): void {
        if (this.ignoredEvents.has(event.eventName)) {
            let matches = true;
            const ie = this.ignoredEvents.get(event.eventName);
            assert(ie !== undefined);
            for (const key of Object.keys(ie)) {
                if (ie[key] !== event[key]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                event.category = "generic";
            }
        }

        super.send(event);
    }
}

describeNoCompat("GC Random tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides: {
                state: "enabled",
                initialSummarizerDelayMs: 0,
                summarizerClientElection: true,
                maxAckWaitTime: 5000,
                maxOpsSinceLastSummary: 10,
                idleTime: 1000,
                minIdleTime: 0,
                maxIdleTime: 2000,
                maxTime: 4000,
                maxOps: 5,
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
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
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
    const random = makeRandom(seed);

    beforeEach(async () => {
        provider = getTestObjectProvider({
            syncSummarizer: true,
        });
        overrideLogger = new IgnoreErrorLogger(provider.logger);
        provider.logger = overrideLogger;

        // Create a Container for the first client.
        mainContainer = await createContainer();
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        connectedContainers = [];
        closedContainers = [];
        testNodes = new Map();
        testNodes.set(mainDataStore.id, new TestNode(mainDataStore.id, ReferenceState.Root));
    });

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

    const createDataStoreForContainer = async (container: IContainer, dataStoreType: string = "TestDataObject") => {
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, "default");
        const newDataStore = await defaultDataStore.containerRuntime.createDataStore(dataStoreType);
        const newDataObject = await requestFluidObject<TestDataObject>(newDataStore, "");
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

    const referenceDataStore = (dataStore: TestDataObject, parentDataStore: TestDataObject) => {
        parentDataStore._root.set(dataStore.id, dataStore.handle);
        const parentNode = getTestNode(parentDataStore.id);
        parentNode.children.add(dataStore.id);
        getTestNode(dataStore.id).parents.add(parentDataStore.id);
        if (parentNode.referenceState !== ReferenceState.Unreferenced) {
            trackDataStoreAsReferenced(dataStore.id);
        }
    };

    const unreferenceDataStore = (dataStore: TestDataObject, parentDataStore: TestDataObject) => {
        parentDataStore._root.delete(dataStore.id);
        getTestNode(parentDataStore.id).children.delete(dataStore.id);
        getTestNode(dataStore.id).parents.delete(parentDataStore.id);
        updateUnreferencedDataStores(dataStore.id);
    };

    const getRandomContainer = (): IContainer => {
        return random.pick(connectedContainers);
    };

    const getRandomDataStoreFromContainer = async (container: IContainer) => {
        const dataStoreId = random.pick(Array.from(testNodes.values())).id;
        return requestFluidObject<TestDataObject>(container, dataStoreId);
    };

    const getRandomParentForDataStore = async (dataStore: TestDataObject, container: IContainer) => {
        const parents = getTestNode(dataStore.id).parents;
        if (parents.size <= 0) {
            return undefined;
        }
        const parentId = random.pick(Array.from(parents.values()));
        return requestFluidObject<TestDataObject>(container, parentId);
    };

    const referenceRandomDataStore = async () => {
        if (connectedContainers.length <= 0 || testNodes.size <= 0) {
            return;
        }
        const container = getRandomContainer();
        const dataStore = await getRandomDataStoreFromContainer(container);
        const parent = await getRandomDataStoreFromContainer(container);
        referenceDataStore(dataStore, parent);
    };

    const unreferenceRandomDataStore = async () => {
        if (connectedContainers.length <= 0 || testNodes.size <= 0) {
            return;
        }
        const container = getRandomContainer();
        const dataStore = await getRandomDataStoreFromContainer(container);
        const parentDataStore = await getRandomParentForDataStore(dataStore, container);
        if (parentDataStore === undefined) {
            return;
        }
        unreferenceDataStore(dataStore, parentDataStore);
    };

    const actionsList: (() => Promise<void>)[] = [
        loadNewContainer,
        closeRandomContainer,
        createDataStoreForRandomContainer,
        referenceRandomDataStore,
        unreferenceRandomDataStore,
    ];
    const testTime = 60 * 1000; // 1 minute

    it.skip(`Create and reference and unreference datastores with multiple containers. Seed: ${seed}`, async () => {
        overrideLogger.ignoreExpectedEventTypes({
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: ContainerErrorType.clientSessionExpiredError,
        });

        const testEnd = Date.now() + testTime;
        const errorList: any[] = [];
        while (Date.now() < testEnd) {
            const sleepTime: number = randomInteger(0, defaultSessionExpiryDurationMs + 1000);
            const action = random.pick(actionsList);

            action().catch((error) => {
                errorList.push(error);
            });
            await sleep(sleepTime);
        }
        assert(errorList.length === 0, `${errorList}`);
    }).timeout(100 * 1000); // Add 40s of leeway

    // pick random runtime options (maybe a certain distribution as well)
    // pick random feature flags (maybe a certain distribution as well)
    // Assign random datastores and blobs
    // Make random edits -
    // Controlled summaries
});
