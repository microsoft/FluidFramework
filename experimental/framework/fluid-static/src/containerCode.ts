/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    DataObject,
    DataObjectFactory,
    defaultRouteRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";

export type IdToDataObjectCollection = Record<string, IFluidStaticDataObjectClass>;

export interface IFluidStaticDataObjectClass {
    readonly factory: IFluidDataStoreFactory;
}

export class RootDataObject extends DataObject {
    protected async initializingFirstTime() { }

    protected async hasInitialized() { }

    public async createDataObject<T extends IFluidLoadable = IFluidLoadable>(
        dataObjectClass: IFluidStaticDataObjectClass,
        id: string,
    ) {
        const factory = dataObjectClass.factory;
        const packagePath = [...this.context.packagePath, factory.type];
        const router = await this.context.containerRuntime.createDataStore(packagePath);
        const object = await requestFluidObject<T>(router, "/");
        this.root.set(id, object.handle);
        return object;
    }

    public async getDataObject<T extends IFluidLoadable = IFluidLoadable>(id: string) {
        const handle = await this.root.wait<IFluidHandle<T>>(id);
        return handle.get();
    }
}

const rootDataStoreId = "rootDOId";
/**
 * The DOProviderContainerRuntimeFactory is the container code for our scenario.
 *
 * By including the createRequestHandler, we can create any droplet types we include in the registry on-demand.
 * These can then be retrieved via container.request("/dataObjectId").
 */
export class DOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    private readonly rootDataObjectFactory; // type is DataObjectFactory
    private readonly initialDataObjects: IdToDataObjectCollection;
    constructor(
        registryEntries: NamedFluidDataStoreRegistryEntry[],
        initialDataObjects: IdToDataObjectCollection = {},
    ) {
        const rootDataObjectFactory = new DataObjectFactory(
            "rootDO",
            RootDataObject,
            [],
            {},
            registryEntries,
        );
        super([rootDataObjectFactory.registryEntry], [], [defaultRouteRequestHandler(rootDataStoreId)]);
        this.rootDataObjectFactory = rootDataObjectFactory;
        this.initialDataObjects = initialDataObjects;
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const rootDataObject = await runtime.createRootDataStore(
            this.rootDataObjectFactory.type,
            rootDataStoreId,
        ) as RootDataObject;

        const initialDataObjects: Promise<IFluidLoadable>[] = [];
        // If the developer provides additional DataObjects we will create them
        Object.entries(this.initialDataObjects).forEach(([id, dataObjectClass]) => {
            initialDataObjects.push(rootDataObject.createDataObject(dataObjectClass, id));
        });

        await Promise.all(initialDataObjects);
    }
}
