/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { DataObject, getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory, IFluidStaticDataObjectClass } from "./containerCode";

export interface ContainerConfig {
    dataObjects: IFluidStaticDataObjectClass[],
}

export interface CreateContainerConfig extends ContainerConfig {
    /**
     * initial DataObjects will be created when the Container is first created.
     */
    initialDataObjects?: [string, IFluidStaticDataObjectClass][]
}

export class FluidContainer {
    private readonly types: Set<string>;
    constructor(
        private readonly container: IContainer,
        namedRegistryEntries: NamedFluidDataStoreRegistryEntry[],
        public readonly createNew: boolean) {
        this.types = new Set();
        namedRegistryEntries.forEach((value: NamedFluidDataStoreRegistryEntry) => {
            const type = value[0];
            if (this.types.has(type)) {
                throw new Error(`Multiple DataObjects share the same type identifier ${value}`);
            }
            this.types.add(type);
        });
    }

    public async createDataObject<T extends DataObject>(
        dataObjectClass: IFluidStaticDataObjectClass, id: string): Promise<T> {
        const type = dataObjectClass.factory.type;
        // This is a runtime check to ensure the developer doesn't try to create something they have not defined.
        if (!this.types.has(type)) {
            throw new Error("Trying to create a DataObject that was not defined in the Fluid.init");
        }

        await this.container.request({ url: `/create/${type}/${id}` });
        const dataObject = await this.getDataObject<T>(id);
        return dataObject;
    }

    public async getDataObject<T extends DataObject>(id: string): Promise<T> {
        const dataObject = await getObjectWithIdFromContainer<T>(id, this.container);
        return dataObject;
    }
}

/**
 * FluidInstance provides the ability to have a Fluid object with a specific backing server outside of the
 * global context.
 */
export class FluidInstance {
    private readonly containerService: IGetContainerService;

    public constructor(getContainerService: IGetContainerService) {
        // check for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        this.containerService = getContainerService;
    }

    public async createContainer(id: string, config: CreateContainerConfig): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(config.dataObjects);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries, config.initialDataObjects),
            true, /* createNew */
        );
        return new FluidContainer(container, registryEntries, true /* createNew */);
    }
    public async getContainer(id: string, config: CreateContainerConfig): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(config.dataObjects);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        return new FluidContainer(container, registryEntries, false /* createNew */);
    }

    private getRegistryEntries(dataObjects: IFluidStaticDataObjectClass[]) {
        if (dataObjects.length === 0) {
            throw new Error("Container cannot be initialized without DataObjects");
        }

        const dataObjectClassToRegistryEntry = (
            dataObjectClass: IFluidStaticDataObjectClass): NamedFluidDataStoreRegistryEntry =>
            [dataObjectClass.factory.type, Promise.resolve(dataObjectClass.factory)];

        return dataObjects.map(dataObjectClassToRegistryEntry);
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
        id: string, config: CreateContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container");
        }
        return globalFluid.createContainer(id, config);
    },
    async getContainer(
        id, config: CreateContainerConfig): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container");
        }
        return globalFluid.getContainer(id, config);
    },
};
