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

export class FluidContainer {
    private readonly types: Set<string>;
    constructor(
        private readonly container: IContainer,
        namedRegistryEntries: NamedFluidDataStoreRegistryEntry[],
        public readonly createNew: boolean) {
            this.types = new Set();
            namedRegistryEntries.forEach((value: NamedFluidDataStoreRegistryEntry) => {
                this.types.add(value[0]);
            });
        }

    public async createDataObject<T extends DataObject>(
        dataObjectClass: IFluidStaticDataObjectClass, id: string): Promise<T>
    {
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

export class FluidInstance {
    private readonly registryEntries: NamedFluidDataStoreRegistryEntry[];
    private readonly containerService: IGetContainerService;

    public constructor(dataObjectClasses: IFluidStaticDataObjectClass[], getContainerService: IGetContainerService) {
        if (dataObjectClasses.length === 0) {
            throw new Error("Fluid cannot be initialized without DataObjects");
        }

        // check for non-typescript usages
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        const dataObjectClassToRegistryEntry = (
            dataObjectClass: IFluidStaticDataObjectClass): NamedFluidDataStoreRegistryEntry =>
                [dataObjectClass.factory.type, Promise.resolve(dataObjectClass.factory)];

        this.registryEntries = dataObjectClasses.map(dataObjectClassToRegistryEntry);
        this.containerService = getContainerService;
    }

    public async createContainer(docId: string): Promise<FluidContainer> {
        const container = await getContainer(
            this.containerService,
            docId,
            new DOProviderContainerRuntimeFactory(this.registryEntries),
            true, /* createNew */
        );
        return new FluidContainer(container, this.registryEntries, true /* createNew */);
    }
    public async getContainer(docId: string): Promise<FluidContainer> {
        const container = await getContainer(
            this.containerService,
            docId,
            new DOProviderContainerRuntimeFactory(this.registryEntries),
            false, /* createNew */
        );
        return new FluidContainer(container, this.registryEntries, false /* createNew */);
    }
}

let globalFluid: FluidInstance | undefined;
export const Fluid = {
    init(dataObjectClasses: IFluidStaticDataObjectClass[], getContainerService: IGetContainerService) {
        if (globalFluid) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        globalFluid = new FluidInstance(dataObjectClasses, getContainerService);
    },
    async createContainer(docId: string): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container.");
        }
        return globalFluid.createContainer(docId);
    },
    async getContainer(docId: string): Promise<FluidContainer> {
        if (!globalFluid) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container.");
        }
        return globalFluid.getContainer(docId);
    },
};
