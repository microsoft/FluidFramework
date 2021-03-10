/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { DataObject, getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory } from "./containerCode";

export interface IFluidStaticDataObjectClass {
    readonly factory: IFluidDataStoreFactory;
}

export interface FluidContainerProps {
    id: string,
    dataObjects: IFluidStaticDataObjectClass[],
    initialDataObjects: [id: string, dataObject: IFluidStaticDataObjectClass],
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
 * A FluidInstance defines the service that this will be connect
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

    public async createContainer(id: string, dataObjects: IFluidStaticDataObjectClass[]): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(dataObjects);
        const container = await getContainer(
            this.containerService,
            id,
            new DOProviderContainerRuntimeFactory(registryEntries),
            true, /* createNew */
        );
        return new FluidContainer(container, registryEntries, true /* createNew */);
    }
    public async getContainer(id: string, dataObjects: IFluidStaticDataObjectClass[]): Promise<FluidContainer> {
        const registryEntries = this.getRegistryEntries(dataObjects);
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
            throw new Error("Fluid cannot be initialized without DataObjects");
        }

        const dataObjectClassToRegistryEntry = (
            dataObjectClass: IFluidStaticDataObjectClass): NamedFluidDataStoreRegistryEntry =>
            [dataObjectClass.factory.type, Promise.resolve(dataObjectClass.factory)];

        return dataObjects.map(dataObjectClassToRegistryEntry);
    }
}

let globalFluid: FluidInstance | undefined;
export const Fluid = {
    init(getContainerService: IGetContainerService) {
        if (globalFluid) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluid = new FluidInstance(getContainerService);
    },
    async createContainer(id: string, dataObjects: IFluidStaticDataObjectClass[]): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container");
        }
        return globalFluid.createContainer(id, dataObjects);
    },
    async getContainer(id: string, dataObjects: IFluidStaticDataObjectClass[]): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container");
        }
        return globalFluid.getContainer(id, dataObjects);
    },
};
