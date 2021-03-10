/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidDataStoreFactory, NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory } from "./containerCode";

export interface IFluidStaticDataObjectClass {
    readonly factory: IFluidDataStoreFactory;
}

export class FluidContainer {
    constructor(private readonly container: IContainer, public readonly createNew: boolean) { }

    public async createDataObject<T = any>(dataObjectClass: IFluidStaticDataObjectClass, id: string) {
        const type = dataObjectClass.factory.type;
        await this.container.request({ url: `/create/${type}/${id}` });
        const dataObject = await this.getDataObject<T>(id);
        return dataObject;
    }

    public async getDataObject<T = any>(id: string) {
        const dataObject = await getObjectWithIdFromContainer<T>(id, this.container);
        return dataObject;
    }
}

const dataObjectClassToRegistryEntry =
    (dataObjectClass: IFluidStaticDataObjectClass): NamedFluidDataStoreRegistryEntry =>
        [dataObjectClass.factory.type, Promise.resolve(dataObjectClass.factory)];

let hasInit: boolean = false;
let registryEntries: NamedFluidDataStoreRegistryEntry[];
let containerService: IGetContainerService;

export const Fluid = {
    init(dataObjectClasses: IFluidStaticDataObjectClass[], getContainerService: IGetContainerService) {
        if (hasInit) {
            throw new Error("Fluid cannot be initialized more than once");
        }
        if (dataObjectClasses.length === 0) {
            throw new Error("Fluid cannot be initialized without DataObjects");
        }
        if (getContainerService === undefined) {
            throw new Error("Fluid cannot be initialized without a ContainerService");
        }

        hasInit = true;
        registryEntries = dataObjectClasses.map(dataObjectClassToRegistryEntry);
        containerService = getContainerService;
    },
    async createContainer(docId: string): Promise<FluidContainer> {
        if (!hasInit) {
            throw new Error("Fluid has not been properly initialized before attempting to create a container.");
        }
        const container = await getContainer(
            containerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            true, /* createNew */
        );
        return new FluidContainer(container, true /* createNew */);
    },
    async getContainer(docId: string): Promise<FluidContainer> {
        if (!hasInit) {
            throw new Error("Fluid has not been properly initialized before attempting to get a container.");
        }
        const container = await getContainer(
            containerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        return new FluidContainer(container, false /* createNew */);
    },
};
