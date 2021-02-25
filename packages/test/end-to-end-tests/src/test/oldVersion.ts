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
export { Loader } from "old-container-loader";
export const versionString = "N-1";

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "old-aqueduct";
import { SharedCell } from "old-cell";
import { IRuntimeFactory } from "old-container-definitions";
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
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "old-test-utils";

import {
    DataObjectFactoryType,
    ITestContainerConfig,
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

export function getDataStoreFactory(containerOptions?: ITestContainerConfig) {
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

export const createRuntimeFactory = (
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
