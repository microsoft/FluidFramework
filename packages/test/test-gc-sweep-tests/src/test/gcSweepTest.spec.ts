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
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ITelemetryBaseEvent, ITelemetryBaseLogger, ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { TestDataObject } from "./mockSummarizerClient";
import { mockConfigProvider } from "./mockConfigProvider";

class TestNode {
    public readonly parents: Set<string> = new Set();
    public readonly children: Set<string> = new Set();
    constructor(public readonly id: string) {}
}

class IgnoreErrorLogger extends EventAndErrorTrackingLogger {
    constructor(protected readonly baseLogger: ITelemetryBaseLogger) {
        super(baseLogger);
    }

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

        this.baseLogger.send(event);
    }
}

/**
 * Validates this scenario: When a datastore is aliased that it is considered a root datastore and always referenced
 */
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
                state: "disableHeuristics",
                initialSummarizerDelayMs: 0,
                summarizerClientElection: false,
                maxAckWaitTime: 100,
                maxOpsSinceLastSummary: 100,
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

    const uploadedSummaries: ISummaryTree[] = [];

    let overrideLogger: IgnoreErrorLogger;

    let mainContainer: IContainer;
    let connectedContainers: IContainer[];
    let closedContainers: IContainer[];
    let testNodes: Map<string, TestNode>;
    let unrefDataStores: Set<string>;
    let refDataStores: Set<string>;
    let rootDataStores: Set<string>;

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };
    const loadContainer = async (): Promise<IContainer> => {
        return provider.loadContainer(runtimeFactory, { configProvider });
    };

    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    beforeEach(async () => {
        provider = getTestObjectProvider({
            syncSummarizer: true,
        });
        overrideLogger = new IgnoreErrorLogger(provider.logger);
        provider.setOverrideLogger(overrideLogger);

        // Create a Container for the first client.
        mainContainer = await createContainer();
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        connectedContainers = [];
        closedContainers = [];
        testNodes = new Map();
        testNodes.set(mainDataStore.id, new TestNode(mainDataStore.id));
        unrefDataStores = new Set();
        refDataStores = new Set();
        rootDataStores = new Set();
        refDataStores.add(mainDataStore.id);
        rootDataStores.add(mainDataStore.id);

        await provider.ensureSynchronized();
    });

    afterEach(() => {

    });

    itExpects.skip("GC is notified when datastores are aliased.", [
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: ContainerErrorType.clientSessionExpiredError,
        },
    ], async () => {
        const mainContainerDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainContainerDataStore._root.set("test", "123");
        mainContainerDataStore._root.set("123", "123");
        connectedContainers.push(mainContainer);
        await provider.ensureSynchronized();
        const summarizeResults = mainContainerDataStore.containerRuntime.summarizeOnDemand({
            reason: "GC Testing",
        });

        const summarySubmitted = await summarizeResults.summarySubmitted;
        assert(summarySubmitted.success === true, "Expected successful summarizeOnDemand!");
        assert(summarySubmitted.data !== undefined, "Expected summarizeOnDemand data!");
        assert(summarySubmitted.data.stage === "submit", "Should have been submitted");
        assert(summarySubmitted.data.summaryTree !== undefined, "summary tree should exist");
        const summaryTree = summarySubmitted.data.summaryTree;
        uploadedSummaries.push(summaryTree);

        await sleep(defaultSessionExpiryDurationMs);

        await loadContainer();
        assert(mainContainer.closed === true, "Expected mainContainer to be closed!");
        assert(uploadedSummaries.length > 0, `${uploadedSummaries.length}`);
    });

    const randomInteger = (min: number, max: number): number => {
        return makeRandom().integer(min, max);
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
        const index = randomInteger(0, connectedContainers.length - 1);
        return new Promise((resolve) => resolve(connectedContainers[index].close()));
    };

    const createDataStoreForContainer = async (container: IContainer, dataStoreType: string = "TestDataObject") => {
        const defaultDataStore = await requestFluidObject<TestDataObject>(container, "default");
        const newDataStore = await defaultDataStore.containerRuntime.createDataStore(dataStoreType);
        const newDataObject = await requestFluidObject<TestDataObject>(newDataStore, "");
        testNodes.set(newDataObject.id, new TestNode(newDataObject.id));
        unrefDataStores.add(newDataObject.id);
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
        assert(testNode !== undefined, `Datastore ${id} should exist in datastores!`);
        return testNode;
    };

    const updateReferencedDataStores = (id: string) => {
        if (!refDataStores.has(id)) {
            refDataStores.add(id);
            unrefDataStores.delete(id);
            for (const childId of getTestNode(id).children) {
                updateReferencedDataStores(childId);
            }
        }
    };

    const hasReferencedParent = (id: string): boolean => {
        for (const parentNode of getTestNode(id).parents) {
            if (refDataStores.has(parentNode)) {
                return true;
            }
        }
        return false;
    };

    const updateUnreferencedDataStores = (id: string) => {
        if (!unrefDataStores.has(id) && !hasReferencedParent(id)) {
            unrefDataStores.add(id);
            refDataStores.delete(id);
            const testNode = getTestNode(id);
            for (const childId of testNode.children) {
                updateUnreferencedDataStores(childId);
            }
        }
    };

    const referenceDataStore = (dataStore: TestDataObject, parentDataStore: TestDataObject) => {
        parentDataStore._root.set(dataStore.id, dataStore.handle);
        getTestNode(parentDataStore.id).children.add(dataStore.id);
        getTestNode(dataStore.id).parents.add(parentDataStore.id);
        if (refDataStores.has(parentDataStore.id)) {
            updateReferencedDataStores(dataStore.id);
        }
    };

    const unreferenceDataStore = (dataStore: TestDataObject, parentDataStore: TestDataObject) => {
        if (rootDataStores.has(dataStore.id)) {
            return;
        }
        parentDataStore._root.delete(dataStore.id);
        getTestNode(parentDataStore.id).children.delete(dataStore.id);
        getTestNode(dataStore.id).parents.delete(parentDataStore.id);
        updateUnreferencedDataStores(dataStore.id);
    };

    const getRandomContainer = (): IContainer => {
        const id = randomInteger(0, connectedContainers.length - 1);
        return connectedContainers[id];
    };

    const getRandomDataStoreFromContainer = async (container: IContainer) => {
        const random = randomInteger(0, testNodes.size - 1);
        const dataStoreId = Array.from(testNodes.values())[random].id;
        return requestFluidObject<TestDataObject>(container, dataStoreId);
    };

    const getRandomParentForDataStore = async (dataStore: TestDataObject, container: IContainer) => {
        const parents = getTestNode(dataStore.id).parents;
        const random = randomInteger(0, parents.size - 1);
        const parentId = Array.from(parents.values())[random];
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
        unreferenceDataStore(dataStore, parentDataStore);
    };

    const actionsList: (() => Promise<unknown>)[] = [
        loadNewContainer,
        closeRandomContainer,
        createDataStoreForRandomContainer,
        referenceRandomDataStore,
        unreferenceRandomDataStore,
    ];
    let testTime = 0;
    const testEnd = 60 * 1000; // 1 minute
    const testActions: { sleep: number; action: () => Promise<unknown>; }[] = [];
    while (testTime < testEnd) {
        const sleepTime: number = randomInteger(0, defaultSessionExpiryDurationMs + 1000);
        const action = makeRandom().pick(actionsList);
        testActions.push({ sleep: sleepTime, action });
        testTime += sleepTime;
    }

    it("Create and reference and unreference datastores with multiple containers", async () => {
        overrideLogger.ignoreExpectedEventTypes({
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: ContainerErrorType.clientSessionExpiredError,
        });

        for (const action of testActions) {
            void action.action();
            await sleep(action.sleep);
        }
    });

    // pick random runtime options (maybe a certain distribution as well)
    // pick random feature flags (maybe a certain distribution as well)
    // Assign random datastores and blobs
    // Make random edits -
    // Controlled summaries
});
