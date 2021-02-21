/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export * from "old-container-definitions";
export * from "old-core-interfaces";
export { IDocumentServiceFactory, IUrlResolver } from "old-driver-definitions";
export { LocalResolver } from "old-local-driver";
export { IFluidDataStoreFactory } from "old-runtime-definitions";
export { OpProcessingController } from "old-test-utils";

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "old-aqueduct";
import { SharedCell } from "old-cell";
import { IContainer, IRuntimeFactory } from "old-container-definitions";
import { IContainerRuntimeOptions } from "old-container-runtime";
import { SharedCounter } from "old-counter";
import { IChannelFactory } from "old-datastore-definitions";
import { Ink } from "old-ink";
import { SharedDirectory, SharedMap } from "old-map";
import { SharedMatrix } from "old-matrix";
import { ConsensusQueue } from "old-ordered-collection";
import { ConsensusRegisterCollection } from "old-register-collection";
import { IFluidDataStoreFactory } from "old-runtime-definitions";
import { SharedString, SparseMatrix } from "old-sequence";
import {
    ChannelFactoryRegistry,
    createAndAttachContainer,
    createLocalLoader,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    TestObjectProvider,
} from "old-test-utils";
import { LoaderContainerTracker } from "@fluidframework/test-utils";

import {
    createRuntimeFactory,
    DataObjectFactoryType,
    getDataStoreFactory,
    ITestObjectProvider,
    ITestContainerConfig,
    V1,
    V2,
} from "./compatUtils";
import * as newVer from "./newVersion";

// A simple old-version dataStore with runtime/root exposed for testing
// purposes. Used to test compatibility of context reload between
// different runtime versions.
export class OldTestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestDataObjectV1 extends OldTestDataObject {
    public static readonly version = V1;
    public readonly version = V1;
}

export class OldTestDataObjectV2 extends OldTestDataObject {
    public static readonly version = V2;
    public readonly version = V2;
    public static readonly testKey = "version2";
    protected async hasInitialized() {
        this.root.set(OldTestDataObjectV2.testKey, true);
    }
}

const registryMapping = {
    [newVer.SharedMap.getFactory().type]: SharedMap.getFactory(),
    [newVer.SharedString.getFactory().type]: SharedString.getFactory(),
    [newVer.SharedDirectory.getFactory().type]: SharedDirectory.getFactory(),
    [newVer.ConsensusRegisterCollection.getFactory().type]: ConsensusRegisterCollection.getFactory(),
    [newVer.SharedCell.getFactory().type]: SharedCell.getFactory(),
    [newVer.Ink.getFactory().type]: Ink.getFactory(),
    [newVer.SharedMatrix.getFactory().type]: SharedMatrix.getFactory(),
    [newVer.ConsensusQueue.getFactory().type]: ConsensusQueue.getFactory(),
    [newVer.SparseMatrix.getFactory().type]: SparseMatrix.getFactory(),
    [newVer.SharedCounter.getFactory().type]: SharedCounter.getFactory(),
};

// convert a channel factory registry for TestFluidDataStoreFactory to one with old channel factories
function convertRegistry(registry: newVer.ChannelFactoryRegistry = []): ChannelFactoryRegistry {
    const oldRegistry: [string | undefined, IChannelFactory][] = [];
    for (const [key, factory] of registry) {
        const oldFactory = registryMapping[factory.type];
        if (oldFactory === undefined) {
            throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
        }
        oldRegistry.push([key, oldFactory]);
    }

    return oldRegistry;
}

const createOldPrimedDataStoreFactory = (
    registry?: newVer.ChannelFactoryRegistry,
): IFluidDataStoreFactory => {
    return new DataObjectFactory(
        OldTestDataObject.type,
        OldTestDataObject,
        [...convertRegistry(registry)].map((r) => r[1]),
        {});
};

const createOldTestFluidDataStoreFactory = (
    registry?: newVer.ChannelFactoryRegistry,
): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(convertRegistry(registry));
};

function getOldDataStoreFactory(containerOptions?: ITestContainerConfig) {
    switch (containerOptions?.fluidDataObjectType) {
        case undefined:
        case DataObjectFactoryType.Primed:
            return createOldPrimedDataStoreFactory(containerOptions?.registry);
        case DataObjectFactoryType.Test:
            return createOldTestFluidDataStoreFactory(containerOptions?.registry);
        default:
            throw new Error("unknown data store factory type");
    }
}

const createOldTestRuntimeFactory = (
    type: string,
    dataStoreFactory: newVer.IFluidDataStoreFactory | IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
};

export function createOldRuntimeFactory(dataStore): IRuntimeFactory {
    const type = OldTestDataObject.type;
    const factory = new DataObjectFactory(type, dataStore, [], {});
    return new ContainerRuntimeFactoryWithDefaultDataStore(
        factory,
        [[type, Promise.resolve(new DataObjectFactory(type, dataStore, [], {}))]],
    );
}

export async function createOldContainer(
    documentId,
    packageEntries,
    server,
    urlResolver,
    codeDetails,
): Promise<IContainer> {
    const loader = createLocalLoader(packageEntries, server, urlResolver, { hotSwapContext: true });
    return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
}

export function createTestObjectProvider(
    oldLoader: boolean,
    oldContainerRuntime: boolean,
    oldDataStoreRuntime: boolean,
    type: string,
    serviceConfiguration?: Partial<newVer.IClientConfiguration>,
    driver?: newVer.ITestDriver,
): ITestObjectProvider {
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = oldDataStoreRuntime
            ? getOldDataStoreFactory(containerOptions)
            : getDataStoreFactory(containerOptions);

        return oldContainerRuntime
            ? createOldTestRuntimeFactory(type, dataStoreFactory, containerOptions?.runtimeOptions)
            : createRuntimeFactory(type, dataStoreFactory, containerOptions?.runtimeOptions);
    };

    if (driver === undefined) {
        throw new Error("Must provide a driver when using the current loader");
    }
    if (oldLoader) {
        const oldProvider = new TestObjectProvider(
            driver as any,
            containerFactoryFn as () => IRuntimeFactory);

        // Remove once the older version support container tracking (for close)
        if (!(TestObjectProvider as any).patchLoader) {
            const loaderContainerTracker = new LoaderContainerTracker();
            const oldMakeTestLoader = oldProvider.makeTestLoader.bind(oldProvider);
            oldProvider.makeTestLoader = (testContainerConfig?: unknown) => {
                const testLoader = oldMakeTestLoader(testContainerConfig);
                loaderContainerTracker.add(testLoader as any);
                return testLoader;
            };
            const oldReset = oldProvider.reset.bind(oldProvider);
            oldProvider.reset = () => {
                loaderContainerTracker.reset();
                oldReset();
            };
        }
        return oldProvider as unknown as  ITestObjectProvider;
    } else {
        return new newVer.TestObjectProvider(
            driver, containerFactoryFn as () => newVer.IRuntimeFactory);
    }
}
