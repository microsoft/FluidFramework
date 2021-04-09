/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";

import {
    DOProviderContainerRuntimeFactory, FluidContainer,
} from "./containerCode";

import {
    ContainerConfig,
    LoadableObjectClass,
} from "./types";

import {
    isDataObjectClass,
    isSharedObjectClass,
} from "./utils";

/**
 * FluidInstance provides the ability to have a Fluid object with a specific backing server outside of the
 * global context.
 */
class FluidInstance {
    private readonly containerService: IGetContainerService;

    public constructor(getContainerService: IGetContainerService) {
        // This check is for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        this.containerService = getContainerService;
    }

    public async createContainer(id: string, config: ContainerConfig): Promise<FluidContainer> {
        const [registryEntries, sharedObjects] = this.parseDataObjectsFromSharedObjects(config);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries, sharedObjects, config.initialObjects),
            true, /* createNew */
        );
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }

    public async getContainer(id: string, config: ContainerConfig): Promise<FluidContainer> {
        const [registryEntries, sharedObjects] = this.parseDataObjectsFromSharedObjects(config);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries, sharedObjects),
            false, /* createNew */
        );
        const rootDataObject = (await container.request({ url: "/" })).value;
        return rootDataObject as FluidContainer;
    }

    /**
     * The ContainerConfig consists of initialObjects and dynamicObjectTypes. These types can be
     * of both SharedObject or DataObject. This function seperates the two and returns a registery
     * of DataObject types and an array of SharedObjects.
     */
    private parseDataObjectsFromSharedObjects(config: ContainerConfig):
        [NamedFluidDataStoreRegistryEntry[], IChannelFactory[]] {
        const registryEntries: Set<NamedFluidDataStoreRegistryEntry> = new Set();
        const sharedObjects: Set<IChannelFactory> = new Set();

        const tryAddObject = (obj: LoadableObjectClass<any>) => {
            if (isSharedObjectClass(obj)) {
                sharedObjects.add(obj.getFactory());
            } else if (isDataObjectClass(obj)) {
                registryEntries.add([obj.factory.type, Promise.resolve(obj.factory)]);
            } else {
                throw new Error(`Entry is neither a DataObject or a SharedObject`);
            }
        };

        // Add the object types that will be initialized
        Object.values(config.initialObjects).forEach((obj) => {
            tryAddObject(obj);
        });

        // If there are dynamic object types we will add them now
        if (config.dynamicObjectTypes) {
            for (const obj of config.dynamicObjectTypes) {
                tryAddObject(obj);
            }
        }

        if (registryEntries.size === 0 && sharedObjects.size === 0) {
            throw new Error("Container cannot be initialized without any DataTypes");
        }

        return [Array.from(registryEntries), Array.from(sharedObjects)];
    }
}

/**
 * Singular global instance that lets the developer define the Fluid server across all instances of Containers.
 */
let globalFluid: FluidInstance | undefined;
export const Fluid = {
    init(getContainerService: IGetContainerService) {
        if (globalFluid) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluid = new FluidInstance(getContainerService);
    },
    async createContainer(
        id: string, config: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container");
        }
        return globalFluid.createContainer(id, config);
    },
    async getContainer(
        id, config: ContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container");
        }
        return globalFluid.getContainer(id, config);
    },
};
