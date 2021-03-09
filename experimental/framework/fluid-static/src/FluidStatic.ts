/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getContainer, IGetContainerService } from "@fluid-experimental/get-container";
import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory } from "./containerCode";

export class FluidContainer {
    constructor(private readonly container: IContainer, public readonly createNew: boolean) { }

    public async createDataObject<T = any>(type: string, id: string) {
        await this.container.request({ url: `/create/${type}/${id}` });
        const dataObject = await this.getDataObject<T>(id);
        return dataObject;
    }

    public async getDataObject<T = any>(id: string) {
        const dataObject = await getObjectWithIdFromContainer<T>(id, this.container);
        return dataObject;
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Fluid {
    public static async createContainer(
        getContainerService: IGetContainerService,
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidContainer> {
        const container = await getContainer(
            getContainerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            true, /* createNew */
        );
        return new FluidContainer(container, true /* createNew */);
    }

    public static async getContainer(
        getContainerService: IGetContainerService,
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidContainer> {
        const container = await getContainer(
            getContainerService,
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        return new FluidContainer(container, false /* createNew */);
    }
}
