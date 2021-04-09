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

interface RootDataObjectProps {
    initialObjects: IdToDataObjectCollection;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export class RootDataObject extends DataObject<{}, RootDataObjectProps> {
    protected async initializingFirstTime(props: RootDataObjectProps) {
        // Create initial objects provided by the developer
        const initialObjectsP: Promise<void>[] = [];
        Object.entries(props.initialObjects).forEach(([id, dataObjectClass]) => {
            const createObject = async () => {
                const obj = await this.createInternal(dataObjectClass);
                this.root.set(id, obj.handle);
            };
            initialObjectsP.push(createObject());
        });

        await Promise.all(initialObjectsP);
    }

    protected async hasInitialized() { }

    public async createDataObject<T extends IFluidLoadable>(
        dataObjectClass: IFluidStaticDataObjectClass,
        id: string,
    ) {
        const obj = await this.createInternal(dataObjectClass);
        this.root.set(id, obj.handle);
        return obj;
    }

    public async getDataObject<T extends IFluidLoadable>(id: string) {
        const handle = await this.root.wait<IFluidHandle<T>>(id);
        return handle.get();
    }

    private async createInternal<T extends IFluidLoadable>(dataObjectClass: IFluidStaticDataObjectClass) {
        const factory = dataObjectClass.factory;
        const packagePath = [...this.context.packagePath, factory.type];
        const router = await this.context.containerRuntime.createDataStore(packagePath);
        return requestFluidObject<T>(router, "/");
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
        const rootDataObjectFactory =
            // eslint-disable-next-line @typescript-eslint/ban-types
            new DataObjectFactory<RootDataObject, {}, RootDataObjectProps>(
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
        // The first time we create the container we create the RootDataObject
        await this.rootDataObjectFactory.createRootInstance(
            rootDataStoreId,
            runtime,
            { initialObjects: this.initialDataObjects });
    }
}
